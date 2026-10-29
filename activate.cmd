@echo off
rem Active l'environnement local du projet dans cmd.exe (Node portable dans .env\).
rem Usage :  activate
set "AGRICOMPTE_ENV=%~dp0.env"
set "PATH=%AGRICOMPTE_ENV%\node;%AGRICOMPTE_ENV%\npm-global;%AGRICOMPTE_ENV%\platform-tools;%PATH%"
set "npm_config_cache=%AGRICOMPTE_ENV%\npm-cache"
set "npm_config_prefix=%AGRICOMPTE_ENV%\npm-global"
set "EXPO_NO_TELEMETRY=1"
rem Expo cherche adb dans %ANDROID_HOME%\platform-tools : on pointe vers .env (pas besoin d'Android Studio).
set "ANDROID_HOME=%AGRICOMPTE_ENV%"
for /f "delims=" %%v in ('node --version') do echo AgriCompte env actif - node %%v
