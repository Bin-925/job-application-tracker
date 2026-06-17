// 지원 목록에서 3일 이내 면접·마감 알림을 추려서 반환
// 반환: [{ id, type:'면접'|'마감', date, dDay, company, position, status }, ...] D-day 오름차순

export function getNotifications(applications) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const result = []

    const addIfSoon = (app, dateStr, type) => {
        if (!dateStr) return
        const target = new Date(dateStr)
        target.setHours(0, 0, 0, 0)
        const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24))
        // 오늘(0) ~ 3일 이내, 지난 건 제외
        if (diffDays >= 0 && diffDays <= 3) {
            result.push({
                id: app.id,
                type,
                date: dateStr,
                dDay: diffDays,
                company: app.company,
                position: app.position,
                status: app.status,
            })
        }
    }

    applications.forEach((app) => {
        addIfSoon(app, app.interviewDate, '면접')
        addIfSoon(app, app.deadline, '마감')
    })

    // D-day 가까운 순 정렬
    result.sort((a, b) => a.dDay - b.dDay)
    return result
}

// D-day 텍스트 (0이면 D-DAY, 그 외 D-n)
export function dDayText(dDay) {
    return dDay === 0 ? 'D-DAY' : `D-${dDay}`
}