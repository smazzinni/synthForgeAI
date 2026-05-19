$schema = @(
    @{
        name = "users"
        columns = @(
            @{name = "id"; type = "text"},
            @{name = "name"; type = "text"}
        )
    }
)

$body = @{
    schema = $schema
    rowCounts = @{users = 3}
} | ConvertTo-Json -Depth 10

Write-Host "Testing generate-stream API..."
Write-Host "Request body: $body`n"

try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/generate-stream" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing -TimeoutSec 60
    
    Write-Host "Response Status: $($response.StatusCode)"
    Write-Host "Response Content Length: $($response.Content.Length) bytes"
    
    # Extract SSE events
    $events = $response.Content -split "`n" | Where-Object {$_ -match 'data:' } | Select-Object -First 15
    
    Write-Host "`nFirst 15 SSE events:"
    $events | ForEach-Object {
        Write-Host $_
    }
} catch {
    Write-Host "Error: $($_.Exception.Message)"
}
