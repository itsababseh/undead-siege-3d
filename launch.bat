@echo off
REM Undead Siege 3D — local dev launcher
REM Double-click this file to run the game. It starts a tiny local web server
REM (needed because ES modules can't load from file:// URLs) and opens the browser.

setlocal
cd /d "%~dp0"

REM Pick a port; fall back if 8765 is busy
set PORT=8765

REM Prefer python, fall back to node
where python >nul 2>nul
if %ERRORLEVEL%==0 (
    start "" "http://localhost:%PORT%/"
    python -m http.server %PORT%
    goto :eof
)

where py >nul 2>nul
if %ERRORLEVEL%==0 (
    start "" "http://localhost:%PORT%/"
    py -m http.server %PORT%
    goto :eof
)

where npx >nul 2>nul
if %ERRORLEVEL%==0 (
    start "" "http://localhost:%PORT%/"
    npx --yes http-server -p %PORT% -c-1
    goto :eof
)

echo ERROR: Neither Python nor Node is installed. Install one of them to run locally.
pause
