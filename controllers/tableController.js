const Table = require("../models/Table.js");
const crypto = require("crypto");

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

    const tableCount = await Table.countDocuments({ gameType });
    const tableName = `${gameType} ${tableCount + 1}`;

    let inviteCode = null;
    if (isPrivate) {
      inviteCode = crypto.randomBytes(4).toString("hex");
    }

    const table = await Table.create({
      tableName,
      gameType,
      stake,
      maxPlayers,
      isPrivate,
      inviteCode,
      createdBy,
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
    const userId = req.user.id;
    const username = req.user.username;
    const { tableId } = req.params;

    const table = await Table.findById(tableId);

    if (!table) {
      return res.status(404).json({ message: "Table not found" });
    }

    if (table.status !== "WAITING") {
      return res.status(400).json({ message: "Game already started" });
    }

    const already = table.players.some((p) => p.userId.toString() === userId);

    if (already) {
      return res.status(400).json({ message: "Already in table" });
    }

    if (table.players.length >= table.maxPlayers) {
      return res.status(400).json({ message: "Table full" });
    }

    table.players.push({
      userId,
      username,
      joinedAt: new Date(),
    });

    if (table.players.length === table.maxPlayers) {
      table.status = "IN_PROGRESS";
    }

    await table.save();

    res.json({ success: true, data: table });
  } catch (err) {
    console.error("Join table error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
