function turnTimestamp(turnId) {
    const match = String(turnId || '').match(/^voice-(\d+)-/);
    return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}
export function insertByTurn(items, message) {
    if (message.origin === 'announcement') {
        const sequence = Number(message.deliverySequence);
        const insertAt = Number.isFinite(sequence)
            ? items.findIndex(item => (item.origin === 'announcement'
                && Number(item.deliverySequence) > sequence))
            : -1;
        if (insertAt < 0)
            return [...items, message];
        const next = [...items];
        next.splice(insertAt, 0, message);
        return next;
    }
    if (!message.turnId)
        return [...items, message];
    const matching = items
        .map((item, index) => item.turnId === message.turnId ? index : -1)
        .filter(index => index >= 0);
    let insertAt;
    if (matching.length) {
        insertAt = message.role === 'user' ? matching[0] : matching[matching.length - 1] + 1;
    }
    else {
        const timestamp = turnTimestamp(message.turnId);
        insertAt = items.findIndex(item => turnTimestamp(item.turnId) > timestamp);
        if (insertAt < 0)
            insertAt = items.length;
    }
    const next = [...items];
    next.splice(insertAt, 0, message);
    return next;
}
export function upsertUserTranscript(items, input) {
    const content = String(input.content || '').replace(/\s+/g, ' ').trim();
    if (!content)
        return items;
    const message = {
        id: input.id,
        role: 'user',
        content,
        turnId: input.turnId,
        final: Boolean(input.final),
        live: !input.final,
    };
    const index = items.findIndex(item => item.id === input.id);
    if (index < 0)
        return insertByTurn(items, message);
    const next = [...items];
    next[index] = { ...next[index], ...message };
    return next;
}
export function discardUserTranscript(items, turnId) {
    if (!turnId)
        return items;
    const id = `user:${turnId}`;
    return items.filter(item => item.id !== id || item.final);
}
export function settleUserTranscript(items, turnId) {
    if (!turnId)
        return items;
    const id = `user:${turnId}`;
    const index = items.findIndex(item => item.id === id);
    if (index < 0)
        return items;
    const next = [...items];
    next[index] = { ...next[index], final: true, live: false };
    return next;
}
export function upsertAssistantTranscript(items, message, replace = false) {
    const index = items.findIndex(item => item.id === message.id);
    if (index < 0)
        return insertByTurn(items, message);
    const current = items[index];
    const next = [...items];
    next[index] = {
        ...current,
        ...message,
        content: replace ? message.content : current.content + message.content,
    };
    return next;
}
