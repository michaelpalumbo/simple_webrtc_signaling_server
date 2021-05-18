// IMPORRTS
const http = require("http");
const express = require("express");
const socketio = require("socket.io");
const cors = require("cors");
const sirv = require("sirv");

// ENVIRONMENT VARIABLES
const port = process.env.PORT || 3031;
const dev = process.env.NODE_ENV === "development";
const TOKEN = process.env.TOKEN;

// SETUP SERVERS
const app = express();
app.use(express.json(), cors());
const server = http.createServer(app);
const io = socketio(server, { cors: {} });

// AUTHENTICATION MIDDLEWARE
io.use((socket, next) => {
    const token = socket.handshake.auth.token; // check the auth token provided by the client upon connection
    if (token === TOKEN) {
        next();
    } else {
        next(new Error("Authentication error"));
    }
});

// API ENDPOINT TO DISPLAY THE CONNECTION TO THE SIGNALING SERVER
let connections = {};
app.get("/connections", (req, res) => {
    let conList = [];
    for (const con in connections) {
        conList.push(connections[con]);
    }
    res.json(conList);
});

// MESSAGING LOGIC
io.on("connection", (socket) => {
    console.log("User connected with id", socket.id);

    socket.on("ready", (peerId, peerType) => {
        // Make sure that the hostname is unique, if the hostname is already in connections, send an error and disconnect
        if (peerId in connections) {
            socket.emit("uniquenessError", {
                message: `${peerId} is already connected to the signalling server. Please change your peer ID and try again.`,
            });
            socket.disconnect(true);
        } else {
            console.log(`Added ${peerId} to connections`);
            // Let new peer know about all exisiting peers
            socket.send({ from: "all", target: peerId, action: "open", payload: connections });
            // Updates connections object
            connections[peerId] = { socketId: socket.id, peerId, peerType };
            // Let all other peers know about new peer
            socket.broadcast.emit("message", {
                from: peerId,
                target: "all",
                payload: connections[peerId],
                action: "open",
            });
        }
    });
    socket.on("message", (message) => {
        // Send message to all peers expect the sender
        socket.broadcast.emit("message", message);
    });
    socket.on("messageOne", (message) => {
        // Send message to a specifi targeted peer
        const { target } = message;
        if (target && connections[target]) {
            io.to(connections[target].socketId).emit("message", { ...message });
        } else {
            console.log(`Target ${target} not found`);
        }
    });
    socket.on("disconnect", () => {
        for (let peerId in connections) {
            // Find the socket id of the disconneting user
            if (connections[peerId].socketId === socket.id) {
                // Make all peers close their peer channels
                console.log("Disconnected", socket.id, "with peerId", peerId);
                socket.broadcast.emit("message", {
                    from: peerId,
                    target: "all",
                    payload: "Peer has left the signaling server",
                    action: "close",
                });
                delete connections[peerId];
            }
        }
    });
});

// SERVE STATIC FILES
app.use(sirv("public", { dev }));

// RUN APP
server.listen(port, console.log(`Listening on port ${port}`));
