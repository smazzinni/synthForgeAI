# Test generation API
$schema = @(
    @{
        name = "users"
        columns = @(
            @{name = "id"; type = "uuid"},
            @{name = "name"; type = "text"},
            @{name = "email"; type = "text"}
        )
    }
)

$body = @{
    schema = $schema
    rowCounts = @{users = 5}
} | ConvertTo-Json -Depth 10

Write-Host "Sending request to generate-stream API..."
$response = Invoke-WebRequest -Uri "http://localhost:3000/api/generate-stream" -Method POST -Body $body -ContentType "application/json" -ErrorAction Continue

Write-Host "Response Content (first 100 lines):"
$response.Content -split "`n" | Select-Object -First 100 | ForEach-Object {
    Write-Host $_
}
