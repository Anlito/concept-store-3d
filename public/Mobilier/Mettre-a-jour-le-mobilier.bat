@echo off
rem Concept Store 3D : met a jour la liste des modeles du professeur (mobilier-prof.js).
rem Double-cliquer sur ce fichier apres avoir ajoute des fichiers .glb dans ce dossier.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Mettre-a-jour-le-mobilier.ps1"
echo.
pause
