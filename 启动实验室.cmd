@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 麦麦偏爱实验室 McTaste Lab
echo 启动后打开 http://127.0.0.1:8766
python scripts\serve.py
pause
