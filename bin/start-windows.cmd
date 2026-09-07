@echo off
setlocal
cd /d "%~dp0.."
node scripts\serve-with-admin.mjs
