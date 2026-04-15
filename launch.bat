@echo off
REM Undead Siege 3D — local dev launcher
REM Double-click this file to run the game. Runs `npm run build` to produce a
REM single-file bundle in dist/, then serves dist/ on localhost. This is needed
REM because (a) ES modules can't load from file://, and (b) multiplayer adds
REM TypeScript client bindings that require a bundler step.

setlocal
cd /d "%~dp0"

set PORT=8765

REM Build first. If this fails we stop — no point serving stale output.
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: npm is not installed. Install Node.js first.
    pause
    exit /b 1
)

echo [launch] Building bundle...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [launch] Build failed. See errors above.
    pause
    exit /b 1
)

REM Serve the bundled dist/ directory. Prefer python, fall back to py, then npx http-server.
where python >nul 2>nul
if %ERRORLEVEL%==0 (
    start "" "http://localhost:%PORT%/"
    cd dist
    python -m http.server %PORT%
    goto :eof
)

where py >nul 2>nul
if %ERRORLEVEL%==0 (
    start "" "http://localhost:%PORT%/"
    cd dist
    py -m http.server %PORT%
    goto :eof
)

where npx >nul 2>nul
if %ERRORLEVEL%==0 (
    start "" "http://localhost:%PORT%/"
    npx --yes http-server dist -p %PORT% -c-1
    goto :eof
)

echo ERROR: Neither Python nor Node http-server is available.
pause
