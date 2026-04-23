@echo off
chcp 65001 > nul
cls

:start
type "%~dp0title.txt"
echo.
echo.
echo  ░ [1]  Frontend     ^(Next.js — moteur JavaScript^)
echo  ░ [2]  Python       ^(Next.js + solver Python^)
echo  ░ [Q]  Quitter
echo.

set /p "choice= ^> "

if /i "%choice%"=="1" goto frontend
if /i "%choice%"=="2" goto python
if /i "%choice%"=="q" goto quit

echo.
echo  ▒ Choix invalide.
echo.
pause
cls
goto start

:frontend
echo.
wsl -d Ubuntu -- bash ~/project/idk/scripts/start-dev.sh
echo.
echo  ░░ Serveur arrete.
echo.
pause
cls
goto start

:python
echo.
wsl -d Ubuntu -- bash ~/project/idk/scripts/start-python.sh
echo.
echo  ░░ Serveur arrete.
echo.
pause
cls
goto start

:quit
echo.
echo  Au revoir.
echo.
exit /b 0
