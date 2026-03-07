const mongoose = require("mongoose");
const Table = require("../models/Table.js");
const User = require("../models/User.js");
const crypto = require("crypto");
const { generateDeck, shuffleDeck } = require("../utils/gameLogic");

const ALLOWED_STAKES = [200, 500, 1000, 2000, 5000, 10000];

exports.createTable = async (req, res) => {
  try {
    const { gameType, stake, maxPlayers, isPrivate, createdBy } = req.body;

    if (!ALLOWED_STAKES.includes(stake)) {
      return res.status(400).json({ message: "Invalid stake" });
    }

    if (![2, 3, 4].includes(maxPlayers)) {
      return res.status(400).json({ message: "Invalid table size" });
    }

    // Fetch user to get username
    const user = await User.findById(createdBy);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const tableCount = await Table.countDocuments({ gameType });
    const tableName = `${gameType} ${tableCount + 1}`;

    let inviteCode = null;
    if (isPrivate) {
      inviteCode = crypto.randomBytes(4).toString("hex");
    }

    // WHOT! Rules: Generate and shuffle deck
    let deck = generateDeck();
    deck = shuffleDeck(deck);

    // Initial hand for creator
    const creatorHand = deck.splice(0, 5);
    const topCard = deck.splice(0, 1)[0];

    const table = await Table.create({
      tableName,
      gameType,
      stake,
      maxPlayers,
      isPrivate,
      inviteCode,
      createdBy,
      deck,
      discardPile: [topCard],
      currentTurn: 0,
      players: [
        {
          userId: user._id,
          username: `${user.firstName} ${user.lastName}`.trim(),
          hand: creatorHand,
          joinedAt: new Date(),
        },
      ],
    });

    res.json({
      success: true,
      data: table,
    });
  } catch (err) {
    console.error("Create table error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.listTables = async (req, res) => {
  try {
    const { gameType } = req.query;

    const filter = {};
    if (gameType && ["WHOT", "POKER"].includes(gameType.toUpperCase())) {
      filter.gameType = gameType.toUpperCase();
    }

    const tables = await Table.find(filter).sort({ createdAt: -1 });

    res.json({ success: true, data: tables });
  } catch (err) {
    console.error("List tables error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.joinTable = async (req, res) => {
  try {
    const { tableId, userId: bodyUserId } = req.body;
    const userId = bodyUserId || (req.user && req.user.id);

    console.log("Join request received:", { tableId, userId });

    if (!tableId || !userId) {
      return res.status(400).json({ message: "Table ID and User ID are required" });
    }

    // Validate if IDs are valid mongo ObjectIds to avoid CastError
    if (!mongoose.Types.ObjectId.isValid(tableId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid Table ID or User ID format" });
    }

    const [table, user] = await Promise.all([
      Table.findById(tableId),
      User.findById(userId)
    ]);

    if (!table) {
      console.log("Table not found:", tableId);
      return res.status(404).json({ message: "Table not found" });
    }

    if (!user) {
      console.log("User not found:", userId);
      return res.status(404).json({ message: "User not found" });
    }

    if (table.status !== "WAITING") {
      return res.status(400).json({ message: "Game already started" });
    }

    // Check if player is already at the table
    const already = table.players.some((p) => p.userId && p.userId.toString() === userId.toString());

    if (already) {
      return res.status(400).json({ message: "Already in table" });
    }

    if (table.players.length >= table.maxPlayers) {
      return res.status(400).json({ message: "Table full" });
    }

    const playerName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || "Unknown Player";

    // Draw 5 cards for the joining player
    const playerHand = table.deck.splice(0, 5);

    table.players.push({
      userId: user._id,
      username: playerName,
      hand: playerHand,
      joinedAt: new Date(),
    });

    if (table.players.length === table.maxPlayers) {
      table.status = "IN_PROGRESS";
    }

    await table.save();
    console.log(`User ${playerName} successfully joined table ${table.tableName}`);

    res.json({ success: true, data: table });
  } catch (err) {
    console.error("Join table error details:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
