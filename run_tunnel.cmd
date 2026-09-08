@echo off
cd /d "c:\Users\daniel.avila\Desktop\agentes Pro"
:loop
"C:\Users\daniel.avila\AppData\Local\cloudflared\cloudflared.exe" tunnel run --token-file ".tunnel_token" >> "tunnel-out.log" 2>> "tunnel-err.log"
timeout /t 3 /nobreak > nul
goto loop
