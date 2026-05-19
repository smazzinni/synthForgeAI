# Test to see raw AI output
$body = @{
    schema = @(
        @{
            name = "users"
            columns = @(
                @{name = "id"; type = "text"},
                @{name = "name"; type = "text"}
            )
        }
    )
    rowCounts = @{users = 2}
} | ConvertTo-Json -Depth 10

Write-Host "Calling generate-stream API..."
Write-Host "Request body:"
Write-Host $body

$response = Invoke-WebRequest -Uri "http://localhost:3000/api/generate-stream" -Method POST -Body $body -ContentType "application/json" -ErrorAction Continue -UseBasicParsing

Write-Host "`nFull Response:"
$response.Content | Out-String
