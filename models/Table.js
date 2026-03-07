const mongoose = require("mongoose");

const tableSchema = new mongoose.Schema(
  {
    tableName: { type: String, required: true },
    gameType: {
      type: String,
      enum: ["WHOT", "POKER"],
      required: true,
    },

    stake: {
      type: Number,
      required: true,
      enum: [200, 500, 1000, 2000, 5000, 10000],
    },

    maxPlayers: {
      type: Number,
      enum: [2, 3, 4],
      required: true,
    },

    isPrivate: { type: Boolean, default: false },
    inviteCode: { type: String, default: null },

    status: {
      type: String,
      enum: ["WAITING", "IN_PROGRESS", "FINISHED"],
      default: "WAITING",
    },

    players: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        username: String,
        joinedAt: { type: Date, default: Date.now },
        hand: { type: Array, default: [] },
        score: { type: Number, default: 0 },
      },
    ],
    deck: { type: Array, default: [] },
    discardPile: { type: Array, default: [] },
    currentTurn: { type: Number, default: 0 },
    lastTurnAt: { type: Date, default: Date.now },
    nextSuit: { type: String, default: null }, // For WHOT (20) card demand
    winner: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Table", tableSchema);