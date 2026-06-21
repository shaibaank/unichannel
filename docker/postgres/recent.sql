SELECT c.channel, m.direction, m."sentBy", left(m.body,50) AS body
FROM messages m JOIN conversations c ON c.id = m."conversationId"
WHERE c.channel = 'EMAIL'
ORDER BY m.timestamp DESC LIMIT 10;
