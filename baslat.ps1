# Demo baslatma betigi.
#
# Iki sey calisiyor olmali, yoksa uygulamada kutular gelmez:
#   1. YOLO servisi (uvicorn, port 7860)
#   2. Cloudflare tuneli (servisi internete acar)
#
# Tunel her yeniden baslatildiginda ADRES DEGISIR. Betik yeni adresi ekrana
# yazar; onu Vercel'deki YOLO_URL degiskenine yapistirip yeniden yayinla.
#
# Kullanim: PowerShell'de bu klasorde ->  .\baslat.ps1

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
Yaz " Bunu Vercel'e gir:" White
Yaz "   Proje > Settings > Environment Variables > YOLO_URL" White
Yaz "   Sonra Deployments > en ustteki > ... > Redeploy" White
Write-Host ""
Yaz " Acilan iki pencereyi KAPATMA. Kapanirsa kutular gelmez." Red
Write-Host ""

Set-Clipboard -Value $adres -ErrorAction SilentlyContinue
Yaz " (adres panoya kopyalandi)" DarkGray
