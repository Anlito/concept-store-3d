@echo off
rem Concept Store 3D : copie l outil dans le dossier de chaque classe (liste dans classes.txt).
rem Double-cliquer apres une mise a jour de l outil, du mobilier ou d un projet modele.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Deployer-dans-les-classes.ps1"
echo.
pause
