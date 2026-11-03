@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Necesitas Node.js LTS: https://nodejs.org/
  pause
  exit /b 1
)
if not exist node_modules (
  echo Instalando dependencias ^(requiere Internet una vez^)...
  call npm install
  if errorlevel 1 (
    echo Error de npm install. Comprueba conexion y Node.js.
    pause
    exit /b 1
  )
)
echo Iniciando servidor web en una nueva ventana...
start "Servidor IMIS Structural XR" cmd /k "npm run dev"
timeout /t 5 /nobreak >nul
start "" "http://localhost:5173"
echo Abriendo en el navegador. No cierres la ventana del servidor.
pause
