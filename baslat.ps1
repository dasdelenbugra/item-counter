# Demo baslatma betigi.
#
# Iki sey calisiyor olmali, yoksa uygulamada kutular gelmez:
#   1. YOLO servisi (uvicorn, port 7860)
#   2. Cloudflare tuneli (servisi internete acar)
#
# Tunel her yeniden baslatildiginda ADRES DEGISIR. Betik yeni adresi bulur,
# Vercel'deki YOLO_URL degiskenine yazar ve yeniden yayinlar.
#
# Kullanim:
#   .\baslat.ps1          -> hepsini yap (PC kapandiktan sonra bunu calistir)
#   .\baslat.ps1 -Atla    -> Vercel'e dokunma, sadece yerelde calistir

param([switch]$Atla)

$ErrorActionPreference = "Stop"
$kok = Split-Path -Parent $MyInvocation.MyCommand.Definition
$log = Join-Path $env:TEMP "cloudflared-raf.log"

function Yaz($metin, $renk = "White") { Write-Host $metin -ForegroundColor $renk }

# --- 1) YOLO servisi ---------------------------------------------------------

function YoloAyaktaMi {
    try {
        Invoke-RestMethod -Uri "http://127.0.0.1:7860/" -TimeoutSec 2 | Out-Null
        return $true
    } catch { return $false }
}

if (YoloAyaktaMi) {
    Yaz "YOLO servisi zaten calisiyor." Green
} else {
    Yaz "YOLO servisi baslatiliyor..." Cyan
    Start-Process -FilePath "python" `
        -ArgumentList "-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", "7860" `
        -WorkingDirectory (Join-Path $kok "yolo-servis")

    # Model bellege yuklenirken ilk saniyeler cevapsiz kalir.
    $sure = 0
    while (-not (YoloAyaktaMi)) {
        Start-Sleep -Seconds 2
        $sure += 2
        if ($sure -ge 90) {
            Yaz "YOLO 90 saniyede ayaga kalkmadi. Acilan pencerede hata var mi bak." Red
            exit 1
        }
    }
    Yaz "YOLO servisi hazir." Green
}

# --- 2) Cloudflare tuneli ----------------------------------------------------

$cf = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cf) { $cf = "C:\Program Files (x86)\cloudflared\cloudflared.exe" }
if (-not (Test-Path $cf)) {
    Yaz "cloudflared bulunamadi. Kurmak icin: winget install --id Cloudflare.cloudflared" Red
    exit 1
}

# Onceki tunel varsa kapat: ikisi ayni anda calisirsa hangi adresin gecerli
# oldugu karisir.
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
if (Test-Path $log) { Remove-Item $log -Force }

Yaz "Tunel aciliyor..." Cyan
Start-Process -FilePath $cf `
    -ArgumentList "tunnel", "--url", "http://127.0.0.1:7860", "--no-autoupdate" `
    -RedirectStandardError $log `
    -WindowStyle Minimized

# Adres cloudflared'in ciktisinda beliriyor, dosyayi izleyerek yakaliyoruz.
$adres = $null
$sure = 0
while (-not $adres -and $sure -lt 60) {
    Start-Sleep -Seconds 2
    $sure += 2
    if (Test-Path $log) {
        $bulunan = Select-String -Path $log -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" -ErrorAction SilentlyContinue
        if ($bulunan) { $adres = $bulunan.Matches[0].Value }
    }
}

if (-not $adres) {
    Yaz "Tunel adresi alinamadi. Log: $log" Red
    exit 1
}

# --- 3) Disaridan gercekten erisilebiliyor mu --------------------------------

# Adres olusur olusmaz erisilebilir olmuyor: Cloudflare kenar sunucularina
# yayilmasi olculdugu kadariyla 1-2 dakika suruyor. Bu yuzden uzun bekliyoruz;
# kisa tutunca "calismiyor" sanip bosuna ugrasiyorsun.
Yaz "Adres test ediliyor (yayilmasi 1-2 dakika surebilir)..." Cyan
$calisiyor = $false
for ($i = 1; $i -le 24; $i++) {
    try {
        $c = Invoke-RestMethod -Uri "$adres/" -TimeoutSec 10
        if ($c.durum -eq "ayakta") { $calisiyor = $true; break }
    } catch {
        if ($i % 4 -eq 0) { Yaz "  hala yayiliyor... ($($i * 8) sn)" DarkGray }
        Start-Sleep -Seconds 8
    }
}

Write-Host ""
if ($calisiyor) {
    Yaz "=======================================================" Green
    Yaz " HAZIR" Green
    Yaz "=======================================================" Green
} else {
    Yaz "Tunel acildi ama disaridan cevap alinamadi; birkac saniye sonra" Yellow
    Yaz "calisabilir. Yine de adresi deneyebilirsin." Yellow
}

Write-Host ""
Yaz " YOLO_URL = $adres" Yellow
Write-Host ""
Set-Clipboard -Value $adres -ErrorAction SilentlyContinue

# --- 4) Vercel'i yeni adresle guncelle --------------------------------------
#
# Ucretsiz tunelde adres her baslatmada degisiyor ve Vercel degiskenleri yayin
# aninda sabitliyor: degiskeni degistirmek TEK BASINA yetmiyor, yeniden
# yayinlamak da gerekiyor. Bu yuzden ikisini birlikte yapiyoruz.
if ($Atla) {
    Yaz " Vercel guncellemesi atlandi (-Atla verildi)." DarkGray
    Yaz " Adresi elle gir: Settings > Environment Variables > YOLO_URL, sonra Redeploy." White
} elseif (-not (Test-Path (Join-Path $kok ".vercel\project.json"))) {
    Yaz " Vercel projesi bagli degil. Once: npx vercel link" Yellow
    Yaz " Sonra adresi elle gir ve yeniden yayinla." White
} else {
    Yaz "Vercel guncelleniyor..." Cyan

    # npx bilgi satirlarini stderr'e yaziyor; "Stop" modunda PowerShell bunu
    # hata sanip betigi dusuruyor. Bu blok boyunca gevsetiyoruz ve basariyi
    # ciktiya degil $LASTEXITCODE'a bakarak anliyoruz.
    $eskiTercih = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        # Ayni isimde ikinci degisken eklenemiyor, once eskisini sil.
        # Degisken yoksa hata verir, onemli degil.
        npx --yes vercel env rm YOLO_URL production --yes *> $null

        # Buradan sonrasi kritik: silme basarili olup ekleme basarisiz olursa
        # Production degiskensiz kalir ve uygulama kutusuz calisir, yani betik
        # durumu ESKISINDEN KOTU yapar. Bir kez bu yasandi; o yuzden hem
        # tekrar deniyoruz hem de gercekten yazildigini dogruluyoruz.
        $yazildi = $false
        for ($d = 1; $d -le 3 -and -not $yazildi; $d++) {
            $adres | npx --yes vercel env add YOLO_URL production *> $null
            $liste = (npx --yes vercel env ls 2>&1 | Out-String)
            # "YOLO_URL ... Production" satiri olusmus mu
            if ($liste -match "YOLO_URL\s+\S+\s+\S+\s+[^\r\n]*Production") { $yazildi = $true }
            elseif ($d -lt 3) { Yaz "  yazilamadi, tekrar deneniyor ($d/3)..." DarkGray; Start-Sleep -Seconds 3 }
        }
        if (-not $yazildi) { throw "YOLO_URL Production'a yazilamadi" }

        Yaz "Yeniden yayinlaniyor (40-60 sn)..." Cyan
        $cikti = (npx --yes vercel deploy --prod --yes 2>&1 | Out-String)
        if ($LASTEXITCODE -ne 0) { throw "yayin basarisiz" }

        Yaz "Vercel guncellendi." Green
    } catch {
        Yaz " Vercel guncellenemedi: $($_.Exception.Message)" Red
        Yaz "" White
        Yaz " DIKKAT: Production'daki YOLO_URL silinmis olabilir. Bu haliyle" Red
        Yaz " uygulama calisir ama KUTULAR GELMEZ. Elle duzeltmen gerekiyor:" Red
        Yaz "   1) vercel.com > item-counter > Settings > Environment Variables" White
        Yaz "   2) YOLO_URL ekle (Production isaretli):" White
        Yaz "      $adres" Yellow
        Yaz "   3) Deployments > en ustteki > ... > Redeploy" White
    } finally {
        $ErrorActionPreference = $eskiTercih
    }
}

Write-Host ""
Yaz " Uygulama: https://item-counter-jade.vercel.app" Green
Yaz " (icinde karisik kod olan adresleri kullanma, onlar eski yayina sabit)" DarkGray
Write-Host ""
Yaz " Acilan iki pencereyi KAPATMA. Kapanirsa kutular gelmez." Red
Yaz " PC'yi uyutma: Ayarlar > Sistem > Guc ve pil > Uyku = Hicbir zaman" Red
Write-Host ""
