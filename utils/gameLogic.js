const SUITS = ['CIRCLE', 'TRIANGLE', 'CROSS', 'SQUARE', 'STAR'];

exports.generateDeck = () => {
    const deck = [];

    // Circle: 1-14 (no 6, 9)
    [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14].forEach(val => deck.push({ suit: 'CIRCLE', value: val.toString() }));

    // Triangle: 1-14 (no 6, 9)
    [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14].forEach(val => deck.push({ suit: 'TRIANGLE', value: val.toString() }));

    // Cross: 1, 2, 3, 5, 7, 10, 11, 13, 14 (no 4, 6, 8, 9, 12)
    [1, 2, 3, 5, 7, 10, 11, 13, 14].forEach(val => deck.push({ suit: 'CROSS', value: val.toString() }));

    // Square: 1, 2, 3, 5, 7, 10, 11, 13, 14 (no 4, 6, 8, 9, 12)
    [1, 2, 3, 5, 7, 10, 11, 13, 14].forEach(val => deck.push({ suit: 'SQUARE', value: val.toString() }));

    // Star: 1, 2, 3, 4, 5, 7, 8 (no 6)
    [1, 2, 3, 4, 5, 7, 8].forEach(val => deck.push({ suit: 'STAR', value: val.toString() }));

    // WHOT (Wildcards): 5 cards of 20
    for (let i = 0; i < 5; i++) deck.push({ suit: 'WHOT', value: '20' });

    return deck;
};

exports.shuffleDeck = (deck) => {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
};

exports.isValidMove = (card, topCard, nextSuit) => {
    // WHOT card (20) can always be played
    if (card.value === '20') return true;

    // If a suit was demanded by previous WHOT card
    if (nextSuit) {
        return card.suit === nextSuit;
    }

    // Standard matching rules: suit OR value
    return card.suit === topCard.suit || card.value === topCard.value;
};

exports.getNextPlayerIndex = (currentIndex, maxPlayers, cardValue) => {
    // 1 (Hold On) - Same player plays again
    if (cardValue === '1') return currentIndex;

    // 8 (Suspension) - Skips 1 player
    // 2 (Pick Two) - Skips 1 player
    // 5 (Pick Three) - Skips 1 player
    if (['2', '5', '8'].includes(cardValue)) return (currentIndex + 2) % maxPlayers;

    // 14 (General Market) - Skips 1 player (everyone else draws, then it's effectively next-next player or back to start)
    // Actually, usually in GM, the player who played GM skips a turn? 
    // Image says: "Every other player draws... and loses a turn". 
    // This means the player who played 14 effectively gets another turn after everyone else?
    // Let's stick to standard GM: Everyone draws, turn moves to next person.
    // If "Everyone else loses a turn", then the player who played 14 plays again.
    if (cardValue === '14') return currentIndex;

    // Normal rotation
    return (currentIndex + 1) % maxPlayers;
};

exports.calculateScore = (hand) => {
    return hand.reduce((total, card) => {
        const val = parseInt(card.value);
        if (card.suit === 'WHOT') return total + 20;
        if (card.suit === 'STAR') return total + (val * 2);
        return total + val;
    }, 0);
};
