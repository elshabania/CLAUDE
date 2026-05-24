@echo off
REM Build Snake.exe on Windows using PyInstaller.
REM Requires Python (with pip) on your PATH. Just double-click this file
REM or run it from a terminal: build.bat

echo Installing PyInstaller (if needed)...
pip install pyinstaller || goto :error

echo Building Snake.exe...
pyinstaller --onefile --windowed --name Snake snake.py || goto :error

echo.
echo Done! Your executable is at: dist\Snake.exe
goto :eof

:error
echo.
echo Build failed. Make sure Python and pip are installed and on your PATH.
exit /b 1
