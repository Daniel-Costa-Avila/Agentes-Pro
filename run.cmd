@echo off
set PORT=8090
cd /d "c:\Users\daniel.avila\Desktop\agentes Pro"
:loop
node "server.js" >> "server-out.log" 2>> "server-err.log"
timeout /t 3 /nobreak > nul
goto loop
