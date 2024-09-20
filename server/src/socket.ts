import { nanoid } from "nanoid";
import { Server, Socket } from "socket.io";
import logger from "./utils/logger";

const EVENTS = {
  connection: "connection",
  CLIENT: {
    CREATE_ROOM: "CREATE_ROOM",
    SEND_ROOM_MESSAGE: "SEND_ROOM_MESSAGE",
    JOIN_ROOM: "JOIN_ROOM",
  },
  SERVER: {
    ROOMS: "ROOMS",
    JOINED_ROOM: "JOINED_ROOM",
    ROOM_MESSAGE: "ROOM_MESSAGE",
    ROOM_CREATION_FAILED: "ROOM_CREATION_FAILED",
    ACTIVE_USERS: "ACTIVE_USERS",
  },
};

const rooms: Record<string, { name: string }> = {};
const usersInRoom: Record<string, { [socketId: string]: string }> = {}; // Track users in rooms

function socket({ io }: { io: Server }) {
  logger.info(`Sockets enabled`);

  io.on(EVENTS.connection, (socket: Socket) => {
    logger.info(`User connected ${socket.id}`);

    socket.emit(EVENTS.SERVER.ROOMS, rooms);

    /*
     * When a user creates a new room
     */
    socket.on(EVENTS.CLIENT.CREATE_ROOM, ({ roomId, roomName }) => {
      if (rooms[roomId]) {
        // If roomId already exists, emit failure event
        socket.emit(EVENTS.SERVER.ROOM_CREATION_FAILED, {
          message: "Room ID already exists, please choose a different ID.",
        });
        return;
      }
      // Add a new room to the rooms object
      rooms[roomId] = { name: roomName };
      usersInRoom[roomId] = {}; // Initialize user tracking for the room

      socket.join(roomId);

      // Broadcast an event saying there is a new room
      socket.broadcast.emit(EVENTS.SERVER.ROOMS, rooms);

      // Emit back to the room creator with all the rooms
      socket.emit(EVENTS.SERVER.ROOMS, rooms);
      // Emit event back to the room creator saying they have joined the room
      socket.emit(EVENTS.SERVER.JOINED_ROOM, roomId);
    });

    /*
     * When a user sends a room message
     */
    socket.on(EVENTS.CLIENT.SEND_ROOM_MESSAGE, ({ roomId, message, username }) => {
      const date = new Date();

      socket.to(roomId).emit(EVENTS.SERVER.ROOM_MESSAGE, {
        message,
        username,
        time: `${date.getHours()}:${date.getMinutes()}`,
      });
    });

    /*
     * When a user joins a room
     */
    socket.on(EVENTS.CLIENT.JOIN_ROOM, ({ roomId, username }) => {
      if (rooms[roomId]) {
        // Join the room if it exists
        socket.join(roomId);

        // Add the user to the room's user list using socketId
        usersInRoom[roomId][socket.id] = username;

        // Emit the updated user list to the room
        io.to(roomId).emit(EVENTS.SERVER.ACTIVE_USERS, Object.values(usersInRoom[roomId]));

        socket.emit(EVENTS.SERVER.JOINED_ROOM, roomId);
      } else {
        // If the room doesn't exist, send an error message
        socket.emit(EVENTS.SERVER.ROOM_CREATION_FAILED, {
          message: "Room ID does not exist.",
        });
      }
    });

    /*
     * When a user disconnects
     */
    socket.on('disconnect', () => {
      for (const roomId in usersInRoom) {
        if (usersInRoom[roomId][socket.id]) {
          // Remove the user associated with this socket ID
          delete usersInRoom[roomId][socket.id];

          // Emit the updated user list to the room
          io.to(roomId).emit(EVENTS.SERVER.ACTIVE_USERS, Object.values(usersInRoom[roomId]));
        }
      }
    });
  });
}

export default socket;
