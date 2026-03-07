// Starting the server
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const http = require('http');
const { Server } = require('socket.io');
const Table = require("./models/Table");
const { isValidMove, getNextPlayerIndex, shuffleDeck, generateDeck } = require("./utils/gameLogic");

dotenv.config();

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:5173'
].filter(Boolean);

app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));

const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true
    }
});

app.use(express.json());

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log('MongoDB Connection Error:', err));


const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'GameDey API',
            version: '1.0.0',
            description: 'API Documentation for GameDey Card Gaming Platform',
        },
        servers: [
            {
                url: process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`,
                description: 'API Server',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
        },
    },
    apis: ['./routes/*.js'],
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));


app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/table', require('./routes/tableRoutes'));

// Stats endpoint
app.get('/api/stats/online', (req, res) => {
    res.json({ count: io.engine.clientsCount });
});

// Socket.IO Logic
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('joinTable', ({ tableId, user }) => {
        socket.join(tableId);

        console.log(`${user.firstName || 'User'} joined table ${tableId}`);

        // IMPORTANT: Fetch and send the latest state to EVERYONE in the room
        Table.findById(tableId).then(table => {
            if (table) {
                io.to(tableId).emit('gameStateUpdate', table);
            }
        });
    });

    socket.on('playCard', async ({ tableId, userId, cardIndex, demandedSuit }) => {
        try {
            const table = await Table.findById(tableId);
            if (!table) return;

            const playerIndex = table.players.findIndex(p => p.userId.toString() === userId.toString());
            if (playerIndex !== table.currentTurn) return; // Not your turn

            const player = table.players[playerIndex];
            const card = player.hand[cardIndex];
            const topCard = table.discardPile[table.discardPile.length - 1];

            if (isValidMove(card, topCard, table.nextSuit)) {
                // Remove card from hand
                player.hand.splice(cardIndex, 1);
                table.discardPile.push(card);

                // Clear demanded suit if it's not a WHOT card
                if (card.value !== '20') {
                    table.nextSuit = null;
                } else {
                    table.nextSuit = demandedSuit;
                }

                // Apply Special Card Effects
                // Pick Two (2)
                if (card.value === '2') {
                    const nextPIdx = (table.currentTurn + 1) % table.players.length;
                    const cardsToPick = table.deck.splice(0, 2);
                    table.players[nextPIdx].hand.push(...cardsToPick);
                    console.log(`Pick Two played! Next player picks 2 and skips turn.`);
                }

                // Pick Three (5)
                if (card.value === '5') {
                    const nextPIdx = (table.currentTurn + 1) % table.players.length;
                    const cardsToPick = table.deck.splice(0, 3);
                    table.players[nextPIdx].hand.push(...cardsToPick);
                    console.log(`Pick Three played! Next player picks 3 and skips turn.`);
                }

                // General Market (14)
                if (card.value === '14') {
                    table.players.forEach((p, idx) => {
                        if (idx !== table.currentTurn) {
                            const marketCard = table.deck.splice(0, 1);
                            if (marketCard.length) p.hand.push(marketCard[0]);
                        }
                    });
                    console.log(`General Market played! Everyone else picks 1 card.`);
                }

                table.currentTurn = getNextPlayerIndex(table.currentTurn, table.players.length, card.value);
                table.lastTurnAt = new Date();

                // Winner check
                if (player.hand.length === 0) {
                    table.status = 'FINISHED';
                    table.winner = userId;

                    // Calculate final scores for everyone
                    table.players.forEach(p => {
                        p.score = calculateScore(p.hand);
                    });
                }

                // Refill deck if empty
                if (table.deck.length < 5) {
                    const newCards = table.discardPile.splice(0, table.discardPile.length - 1);
                    table.deck.push(...shuffleDeck(newCards));
                    console.log("Deck refilled from discard pile.");
                }

                await table.save();
                io.to(tableId).emit('gameStateUpdate', table);
            }
        } catch (err) {
            console.error("Play card error:", err);
        }
    });

    socket.on('drawCard', async ({ tableId, userId }) => {
        try {
            const table = await Table.findById(tableId);
            if (!table) return;

            const playerIndex = table.players.findIndex(p => p.userId.toString() === userId.toString());
            if (playerIndex !== table.currentTurn) return;

            const MAX_HAND_SIZE = 15;
            const player = table.players[playerIndex];

            if (table.deck.length > 0) {
                // If hand is full, don't give a card, just skip turn as a penalty
                if (player.hand.length < MAX_HAND_SIZE) {
                    const card = table.deck.splice(0, 1)[0];
                    player.hand.push(card);
                    console.log(`Player drawn a card. Hand size: ${player.hand.length}`);
                } else {
                    console.log(`Player hand full (${MAX_HAND_SIZE}). Skipping turn.`);
                }

                // Passing turn after drawing (standard rules)
                table.currentTurn = (table.currentTurn + 1) % table.players.length;
                table.lastTurnAt = new Date();

                await table.save();
                io.to(tableId).emit('gameStateUpdate', table);
            }
        } catch (err) {
            console.error("Draw card error:", err);
        }
    });

    socket.on('leaveTable', async ({ tableId, user }) => {
        try {
            const table = await Table.findById(tableId);
            if (!table) return;

            // Remove user from database players list
            const leavingUserId = user.id || user._id;
            const playerIndex = table.players.findIndex(p => p.userId.toString() === leavingUserId.toString());

            if (playerIndex !== -1) {
                table.players.splice(playerIndex, 1);

                // If the game was in progress and now only 1 player is left
                if (table.status === 'IN_PROGRESS') {
                    if (table.players.length === 1) {
                        table.status = 'FINISHED';
                        table.winner = table.players[0].userId;
                    } else if (table.players.length > 0) {
                        // Just update turn if needed
                        if (table.currentTurn >= table.players.length) {
                            table.currentTurn = 0;
                        }
                    }
                }

                // If no players left, we can finish or leave table as is
                if (table.players.length === 0) {
                    table.status = 'FINISHED';
                }

                await table.save();

                socket.leave(tableId);
                // Broadcast update to remaining players
                io.to(tableId).emit('gameStateUpdate', table);
                io.to(tableId).emit('playerLeft', { username: user.firstName || user.username || 'Someone' });

                console.log(`${user.firstName || 'User'} left table ${tableId} and was removed from DB.`);
            }
        } catch (err) {
            console.error("Leave table error:", err);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        io.emit('onlinePlayersCount', io.engine.clientsCount);
    });

    // Send initial count to everyone on change
    io.emit('onlinePlayersCount', io.engine.clientsCount);
});

// Global Auto-Draw Loop (Checks every 5 seconds)
setInterval(async () => {
    try {
        const activeTables = await Table.find({ status: 'IN_PROGRESS' });
        const now = new Date();

        for (const table of activeTables) {
            const turnDuration = now - new Date(table.lastTurnAt);
            if (turnDuration > 20000) { // 20 seconds timeout
                const MAX_HAND_SIZE = 15;
                const currentPlayer = table.players[table.currentTurn];

                console.log(`Table ${table.tableName} timed out. Auto-handling for player index ${table.currentTurn}`);

                if (table.deck.length > 0) {
                    // Penalty: If hand is full, don't add more, just skip turn
                    if (currentPlayer.hand.length < MAX_HAND_SIZE) {
                        const card = table.deck.splice(0, 1)[0];
                        currentPlayer.hand.push(card);
                    }

                    table.currentTurn = (table.currentTurn + 1) % table.players.length;
                    table.lastTurnAt = new Date();

                    await table.save();
                    io.to(table._id.toString()).emit('gameStateUpdate', table);
                }
            }
        }
    } catch (err) {
        console.error("Auto-draw loop error:", err);
    }
}, 5000);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
