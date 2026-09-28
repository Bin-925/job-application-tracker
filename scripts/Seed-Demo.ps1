param([string]$BaseUrl = 'http://127.0.0.1:8080/api/v1')
$ErrorActionPreference = 'Stop'
if (([uri]$BaseUrl).Host -notin @('127.0.0.1', 'localhost')) { throw 'Demo seeding is restricted to loopback.' }
$session = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
function Call-Api($Method, $Path, $Data) {
    $parameters = @{ Method = $Method; Uri = "$BaseUrl$Path"; ContentType = 'application/json; charset=utf-8'; WebSession = $session }
    if ($null -ne $Data) { $parameters.Body = [System.Text.Encoding]::UTF8.GetBytes(($Data | ConvertTo-Json -Depth 10)) }
    if ($Method -notin @('Get', 'Head', 'Options')) {
        $csrf = Invoke-RestMethod -Uri "$BaseUrl/members/csrf" -WebSession $session
        $parameters.Headers = @{ $csrf.headerName = $csrf.token }
    }
    Invoke-RestMethod @parameters
}
$credentials = @{ username = 'localdemo925'; password = 'Demo1234'; nickname = '체험 계정' }
Call-Api Post '/members/join' $credentials | Out-Null
Call-Api Post '/members/login' $credentials | Out-Null
$today = Get-Date -Format 'yyyy-MM-dd'
$tomorrow = (Get-Date).AddDays(1).ToString('yyyy-MM-dd')
$later = (Get-Date).AddDays(3).ToString('yyyy-MM-dd')
$first = Call-Api Post '/applications' @{ company = '토스 (샘플)'; position = '백엔드 개발자'; status = 'INTERVIEW'; appliedDate = (Get-Date).AddDays(-4).ToString('yyyy-MM-dd'); memo = '직무 경험과 프로젝트 설계 의도 정리'; link = 'https://example.com' }
Call-Api Post "/applications/$($first.id)/schedules" @{ type = 'INTERVIEW'; title = '1차 직무 면접'; date = $today; time = '17:00'; state = 'SCHEDULED' } | Out-Null
Call-Api Post "/applications/$($first.id)/schedules" @{ type = 'INTERVIEW'; title = '2차 컬처 인터뷰'; date = $later; state = 'SCHEDULED' } | Out-Null
$second = Call-Api Post '/applications' @{ company = '당근 (샘플)'; position = '서버 개발자'; status = 'DOC_PASSED'; appliedDate = (Get-Date).AddDays(-2).ToString('yyyy-MM-dd') }
Call-Api Post "/applications/$($second.id)/schedules" @{ type = 'INTERVIEW'; title = '기술 인터뷰'; date = $tomorrow; time = '14:00'; state = 'SCHEDULED' } | Out-Null
Call-Api Post '/applications' @{ company = '카카오 (샘플)'; position = '플랫폼 엔지니어'; status = 'TO_APPLY'; deadline = $today } | Out-Null
Call-Api Post '/applications' @{ company = '네이버 (샘플)'; position = '백엔드 인턴'; status = 'APPLIED'; appliedDate = $today } | Out-Null
Write-Output 'Local demo ready. Username: localdemo925 / Password: Demo1234'
