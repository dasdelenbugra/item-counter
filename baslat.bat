@echo off
REM Cift tiklanabilir kisayol: baslat.ps1'i calistirir.
REM PC acildiktan sonra bunu cift tikla, baska bir sey yapmana gerek yok.

cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0baslat.ps1"

echo.
echo ---------------------------------------------------------------
echo  Bu pencereyi kapatabilirsin.
echo  Acilan DIGER iki pencereyi (python ve cloudflared) KAPATMA.
echo ---------------------------------------------------------------
echo.
pause
