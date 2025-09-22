# QuMail Git Helper Script
param(
    [string]$message = "Update QuMail application"
)

Write-Host "?? Adding all changes..."
git add .

Write-Host "?? Committing with message: $message"
git commit -m "$message"

Write-Host "?? Pushing to GitHub..."
git push origin main

Write-Host "? Done!"
