const http = require("http");
const https = require("httpolyglot");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const passport = require("passport");
const cors = require("cors");
const fs = require("fs");
const createError = require("http-errors");
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const { sequelize } = require("./models");
const mediasoup = require("mediasoup");

const indexRouter = require("./routes/index");
const usersRouter = require("./routes/users");
const roomRouter = require("./routes/room");
const characterRouter = require("./routes/characters");
const userRoomRouter = require("./routes/userRoom");
const boardRouter = require("./routes/board");

const config = require("./config");

const app = express();
const PORT = 8000;

const options = {
  // key: fs.readFileSync(config.sslKey),
  // cert: fs.readFileSync(config.sslCrt),
};

const httpServer = http.createServer(app);
const io = require("socket.io")(httpServer, {
  cors: {
    origin: ["http://localhost:3000", "https://dev-team-aim.com"],
    credentials: true,
  },
});

// const httpsServer = https.createServer(options, app);
// const io = require("socket.io")(httpsServer, {
//   cors: {
//     origin: ["http://localhost:3000", "https://dev-team-aim.com"],
//     credentials: true,
//   },
// });

// WebRTC SFU (mediasoup)
let worker;
let rooms = {}; // { roomName1: { Router, rooms: [ sicketId1, ... ] }, ...}
let peers = {}; // { socketId1: { roomName1, socket, transports = [id1, id2,] }, producers = [id1, id2,] }, consumers = [id1, id2,], peerDetails }, ...}
let transports = []; // [ { socketId1, roomName1, transport, consumer }, ... ]
let producers = []; // [ { socketId1, roomName1, producer, kind}, ... ]
let consumers = []; // [ { socketId1, roomName1, consumer, }, ... ]

// ------------------------

// express앱과 MySQL을 연결
sequelize
  .sync({ force: false })
  .then(() => {
    console.log("데이터베이스 연결 성공");
  })
  .catch((err) => {
    console.log(err);
  });

// image 사용을 위한 static folder 지정
let corsOption = {
  origin: ["http://localhost:3000", "https://dev-team-aim.com"], // 허락하는 요청 주소
  credentials: true, // true로 하면 설정한 내용을 response 헤더에 추가 해줍니다.
};

/* 전역 변수 */
let charMap = {}; //character information (x,y 등등)

/* for group call */
let groupName = 0;
const MAXIMUM = 10; //Call maximum
let roomObjArr = {
  //   roomName : [user1, user2,,,]
};
let groupObjArr = [
  // {
  //   groupName,
  //   currentNum,
  //   users: [
  //     {
  //       socketId,
  //       nickname,
  //     },
  //   ],
  // },
];
const drawUser = { 1: [], 2: [], 3: [], 4: [], 5: [] };

// let groupUsers = [
//   {
//     groupName : {
//       socketId,
//       nickname,
//     }
//   }
// ]

app.use(cors(corsOption));
app.use(express.static("public"));

// view engine setup
// app.set("views", path.join(__dirname, "views"));
// app.set("view engine", "jade");

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.use("/users", usersRouter);
app.use("/room", roomRouter);
app.use("/character", characterRouter);
app.use("/userRoom", userRoomRouter);
app.use("/board", boardRouter);
app.use("/", indexRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});
// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render("error");
});

httpServer.listen(process.env.PORT || 8000, () => {
  console.log(`Server running on ${PORT}`);
});

// httpsServer.listen(process.env.PORT || 8000, () => {
//   console.log(`Server running on ${PORT}`);
// });

class GameObject {
  constructor(socket) {
    this.socket = socket;
    this.x = 80;
    this.y = 80;
    // this.direction = [];
    this.buffer = [];
    this.src = null;
    this.groupNumber = 0;
    this.nickname = "";
    this.roomId = "";
    // this.src = "https://dynamic-assets.gather.town/sprite/avatar-M8h5xodUHFdMzyhLkcv9-IJzSdBMLblNeA34QyMJg-qskNbC9Z4FBsCfj5tQ1i-KqnHZDZ1tsvV3iIm9RwO-g483WRldPrpq2XoOAEhe-sb7g6nQb3ZYxzNHryIbM.png";
  }
  get id() {
    return this.socket.id;
  }
  pushInput(data) {
    // console.log(data[4]);
    this.x = data[data.length - 1].x;
    this.y = data[data.length - 1].y;
    this.buffer.push(data);
  }
  // update_location() {
  //   const input = this.buffer.shift();
  //   // console.log(input)
  //   if (this.buffer.length > 0) {
  //     this.direction.unshift(input.direction);
  //     if (this.x !== input.x) {
  //       this.x = input.x;
  //     }
  //     if (this.y !== input.y) {
  //       this.y = input.y;
  //     }
  //   }
  // }
}

function handler(req, res) {
  fs.readFile(__dirname + "/index.html", function (err, data) {
    if (err) {
      res.writeHead(500);
      return res.end("Error loading index.html");
    }

    res.writeHead(200);
    res.end(data);
  });
}
function removeDrawUser(nickname) {
  Object.values(drawUser).forEach((users) => {
    for (let i = 0; i < users.length; i++) {
      if (users[i] === nickname) {
        users.splice(i, 1);
        break;
      }
    }
  });
}

function makeGame(socket, roomId) {
  console.log("makeGame func called");
  let user = new GameObject(socket);
  initGameObj = [];
  initGameObj.push(user);
  roomObjArr[roomId] = initGameObj;
  return user;
}

function joinGame(socket, roomId) {
  console.log("joinGame func called");
  let user = new GameObject(socket);
  roomObjArr[roomId].push(user);
  return user;
}

function leaveGame(socket) {
  delete charMap[socket.id];
  Object.values(roomObjArr).forEach((gameGroup) => {
    for (let i = 0; i < gameGroup.length; i++) {
      if (gameGroup[i].id === socket.id) {
        const roomId = gameGroup[i].roomId;
        gameGroup.splice(i, 1);
        if (gameGroup.length === 0) {
          delete roomObjArr[roomId];
        }
        return;
      }
    }
  });
}

function onInput(socket, data) {
  let user = charMap[socket.id];
  user?.pushInput(data);
}

// function updateGame() {
//   Object.values(charMap).forEach((object) => {
//     object.update_location();
//   });
//   setTimeout(updateGame, 16);
// }

function broadcastState() {
  let flag = true;
  Object.values(roomObjArr).forEach((gameGroup) => {
    let data = {};
    for (let i = 0; i < gameGroup.length; i++) {
      let character = gameGroup[i];
      data[i] = character.buffer.shift();
      // data[i] = {
      //   id: character.id,
      //   x: character.x,
      //   y: character.y,
      //   direction: character.direction.shift(),
      //   //groupName도 업데이트 필요
      // };
    }
    io.sockets.in(gameGroup[0].roomId).emit("update_state", data);
  });
  setTimeout(broadcastState, 64);
}

// updateGame();
broadcastState();

// WebRTC SFU (mediasoup)
const createWorker = async () => {
  worker = await mediasoup.createWorker({
    logLevel: config.mediasoup.worker.logLevel,
    logTags: config.mediasoup.worker.logTags,
    rtcMinPort: config.mediasoup.worker.rtcMinPort,
    rtcMaxPort: config.mediasoup.worker.rtcMaxPort, // connection 개수 150개까지 가능 (user수가 n일 때 connection 개수 = n^2)
  });
  // console.log(`worker pid ${worker.pid}`);

  worker.on("died", (error) => {
    // This implies something serious happened, so kill the application
    console.error("mediasoup worker has died");
    setTimeout(() => process.exit(1), 2000); // exit in 2 seconds
  });

  return worker;
};

worker = createWorker();

const { mediaCodecs } = config.mediasoup.router;

io.on("connection", function (socket) {
  console.log(`${socket?.id} has joined!`);

  socket.on("connect_error", () => {
    console.log(`${socket.id} has leaved ${reason}!`);
    const leaveUser = charMap[socket.id];
    removeDrawUser(leaveUser.nickname);
    socket.to(leaveUser.roomId).emit("leave_user", {
      id: socket.id,
      nickname: leaveUser.nickname,
    });
    try {
      // if (peers[socket?.id]) {
        removeUser(socket.id);
        
        socket.to(leaveUser?.roomId).emit("update_closer");
        // socket.to(leaveUser?.roomId).emit("remove_reduplication", socket?.id);
        // }
      } catch (e) {
        console.log("disconnect소켓", e);
      }
      leaveGame(socket);
      setTimeout(() => {
      socket.connect();
    }, 1000);
  });

  socket.on("disconnect", function (reason) {
    console.log(`${socket.id} has leaved ${reason}!`);
    const leaveUser = charMap[socket.id];
    removeDrawUser(leaveUser.nickname);
    socket.to(leaveUser.roomId).emit("leave_user", {
      id: socket.id,
      nickname: leaveUser.nickname,
    });
    try {
      // if (peers[socket?.id]) {
        removeUser(socket.id);
        
        socket.to(leaveUser?.roomId).emit("update_closer");
        socket.to(leaveUser?.roomId).emit("remove_reduplication", socket?.id);
        // }
      } catch (e) {
        console.log("disconnect소켓", e);
      }
      leaveGame(socket);
    });

  socket.on("input", function (data) {
    onInput(socket, data);
  });
  socket.emit("join_user");

  socket.on("send_user_info", function (data) {
    const { src, x, y, nickname, roomId, roomNum } = data;
    socket.join(roomId);
    let newUser;
    if (roomObjArr[roomId]) {
      newUser = joinGame(socket, roomId);
      newUser.x = x;
      newUser.y = y;
      newUser.src = src;
      newUser.nickname = nickname;
      newUser.roomId = roomId;
    } else {
      newUser = makeGame(socket, roomId);
      newUser.x = x;
      newUser.y = y;
      newUser.src = src;
      newUser.nickname = nickname;
      newUser.roomId = roomId;
    }
    // console.log(typeof(roomNum), roomNum)
    charMap[socket.id] = newUser;
    if (roomNum === 2) {
      //room2/28
      if (roomObjArr[roomId].length === 1) {
        makeGroup(socket);
      } else {
        const user = roomObjArr[roomId][0];
        // console.log(user.groupNumber);
        joinGroup(user.groupNumber, socket, nickname);
      }
    }
    const gameGroup = roomObjArr[roomId];
    for (let i = 0; i < gameGroup.length; i++) {
      let user = gameGroup[i];
      socket.emit("get_user_info", {
        id: user.socket.id,
        x: user.x,
        y: user.y,
        src: user.src,
        nickname: user.nickname,
      });
    }
    socket.to(roomId).emit("get_user_info", {
      id: socket.id,
      x: newUser.x,
      y: newUser.y,
      src: newUser.src,
      nickname: newUser.nickname,
    });
  });

  socket.on("user_call", async ({ caller, callee }) => {
    try {
      const user_caller = charMap[caller];
      const user_callee = charMap[callee];

      let guest_gN = user_callee.groupNumber;
      let host_gN = user_caller.groupNumber;

      console.log(guest_gN, host_gN);

      if (guest_gN) {
        // 둘 중 한 명 Group 있을 때
        if (!host_gN) {
          await joinGroup(guest_gN, user_caller.socket, user_callee.nickname);
          user_caller.groupNumber = guest_gN;
          console.log(user_caller.groupNumber, user_callee.groupNumber);
        } else {
          //guest_gN과 host_gN이 다를 경우를 추가
          if (guest_gN != host_gN) {
            console.log("host, guest은 다른 그룹입니다.");
            if (guest_gN > host_gN) {
              await removeUser(caller);
              joinGroup(guest_gN, user_caller.socket, user_callee.nickname);
              user_caller.groupName = guest_gN;
            } else {
              await removeUser(callee);
              joinGroup(host_gN, user_callee.socket, user.caller.nickname);
              user_callee.groupName = host_gN;
            }
          } else {
            console.log("이미 그룹이 생성되었습니다.");
          }
        }
      } else if (!host_gN) {
        // 둘 다 Group 없을 때 (guest X && host X)
        user_caller.groupNumber = await makeGroup(user_caller.socket);
        console.log("Caller가 만든 그룹 번호 :", user_caller.groupNumber);
      } else {
        // guest X && host O
        console.log("else일 때 host_gN: ", host_gN, "guest_gN: ", guest_gN);
      }
    } catch (e) {
      console.log("user_call함수", e);
    }
  });

  socket.on("offer", (offer, remoteSocketId, localNickname) => {
    socket.to(remoteSocketId).emit("offer", offer, socket.id, localNickname);
  });

  socket.on("answer", (answer, remoteSocketId) => {
    socket.to(remoteSocketId).emit("answer", answer, socket.id);
  });

  socket.on("ice", (ice, remoteSocketId) => {
    socket.to(remoteSocketId).emit("ice", ice, socket.id);
  });

  // prev chat socket (Send it to a specific room)

  //
  // socket.on("chat", (message, roomName) => {
  // if (socket.rooms.has(roomName)) {
  //   socket.to(roomName).emit("chat", message);
  // }
  // });

  // current chat socket (Send it to all users)
  //
  socket.on("chat", (isChatInfo, receivers) => {
    receivers.forEach((eachReceiver) => {
      socket.to(eachReceiver?.id).emit("chat", isChatInfo); //nickname 추가
    });
  });

  // WebRTC SFU (mediasoup)           // roomName <== groupName(int)
  socket.on("getRtpCapabilities", async (roomName, callback) => {
    const router1 = await createRoom(roomName, socket.id);
    peers[socket.id] = {
      socket,
      roomName, // Name for the Router this Peer joined
      transports: [],
      producers: [],
      consumers: [],
      peerDetails: {
        name: "",
        isAdmin: false, // Is this Peer the Admin?
      },
    };
    // console.log("*************** peers : ", peers);

    // get Router RTP Capabilities
    const rtpCapabilities = router1.rtpCapabilities;

    // call callback from the client and send back the rtpCapabilities
    callback({ rtpCapabilities });
  });

  const createRoom = async (roomName, socketId) => {
    // worker.createRouter(options)
    // options = { mediaCodecs, appData }
    // mediaCodecs -> defined above
    // appData -> custom application data - we are not supplying any
    // none of the two are required
    let router1;
    let peers = [];
    if (rooms[roomName]) {
      // let rooms = { roomName1: { Router, rooms: [ sicketId1, ... ] }, ...}
      router1 = rooms[roomName].router;
      peers = rooms[roomName].peers || [];
    } else {
      router1 = await worker.createRouter({ mediaCodecs });
      // console.log("----------------- 라우터 생성", router1)
    }

    // console.log(`Router ID: ${router1.id}`, peers.length)

    rooms[roomName] = {
      router: router1,
      peers: [...peers, socketId],
    };

    return router1;
  };

  socket.on("ArtsAddr", (sender, receivers, drawNum) => {
    receivers.forEach((eachReceiver) => {
      socket.to(eachReceiver?.id).emit("ShareAddr", sender, drawNum); //nickname 추가
    });
  });

  socket.on("openDraw", (socketId, drawNum) => {
    const user = charMap[socketId];
    for (let i = 0; i < drawUser[drawNum].length; i++) {
      socket.emit("drawUser", drawUser[drawNum][i], drawNum);
    }
    if (drawUser[drawNum].findIndex((e) => e === user.nickname) === -1) {
      drawUser[drawNum].push(user.nickname);
    }
    socket.to(user.roomId).emit("drawUser", user.nickname, drawNum);
  });

  socket.on("closeDraw", (nickname, drawNum) => {
    const user = charMap[socket.id];
    for (let i = 0; i < drawUser[drawNum]?.length; i++) {
      if (drawUser[drawNum][i] === nickname) {
        drawUser[drawNum].splice(i, 1);
        break;
      }
    }
    socket.to(user.roomId).emit("closeUser", user.nickname);
  });

  socket.on("cursorPosition", (cursorX, cursorY, socketId) => {
    const user = charMap[socketId];
    socket
      .to(user.roomId)
      .emit("shareCursorPosition", cursorX, cursorY, user.nickname);
  });

  socket.on("createWebRtcTransport", async ({ consumer }, callback) => {
    try {
      // get Room Name from Peer's properties
      const roomName = peers[socket.id].roomName;
      // get Router (Room) object this peer is in based on RoomName
      const router = rooms[roomName].router;
      console.log(
        `socket id ${socket.id}가 consumer ${consumer}, createWebRTCTransport요청`
      );
      createWebRtcTransport(router).then(
        async (transport) => {
          callback({
            params: {
              id: transport.id,
              iceParameters: transport.iceParameters,
              iceCandidates: transport.iceCandidates,
              dtlsParameters: transport.dtlsParameters,
            },
          });

          // add transport to Peer's properties
          await addTransport(transport, roomName, consumer);
        },
        (error) => {
          console.log(error);
        }
      );

      const addTransport = (transport, roomName, consumer) => {
        transports = [
          ...transports,
          { socketId: socket?.id, transport, roomName, consumer },
        ];

        peers[socket?.id] = {
          ...peers[socket?.id],
          transports: [...peers[socket?.id]?.transports, transport?.id],
        };
      };
    } catch (e) {
      console.log("createWebRtcTransport <<<<< 에러", e);
    }
  });

  // see client's socket.emit('transport-connect', ...)
  socket.on("transport-connect", async ({ dtlsParameters }) => {
    // console.log('DTLS PARAMS... ', { dtlsParameters })
    try {
      await getTransport(socket.id).connect({ dtlsParameters });
    } catch (e) {
      console.log(e);
    }
  });

  const getTransport = (socketId) => {
    const [producerTransport] = transports.filter(
      (transport) => transport.socketId === socketId && !transport.consumer
    );
    return producerTransport.transport;
  };

  // see client's socket.emit('transport-produce', ...)
  socket.on(
    "transport-produce",
    async ({ kind, rtpParameters, appData }, callback) => {
      try {
        // call produce based on the prameters from the client
        const producer = await getTransport(socket.id).produce({
          kind,
          rtpParameters,
        });

        console.log("%%%%%%%%%%%%%%%%% producerId : ", producer.id, kind);

        // add producer to the producers array
        const { roomName } = peers[socket.id];
        console.log(producers.length);
        await addProducer(producer, roomName, kind);
        console.log(producers.length);
        await informConsumers(roomName, socket.id, producer.id, kind);

        // console.log('Producer ID: ', producer.id, producer.kind);

        producer.on("transportclose", async () => {
          // console.log('transport for this producer closed ')
          await producer.close();
        });

        // Send back to the client the Producer's id
        callback({
          id: producer.id,
          producersExist: producers.length > 1 ? true : false,
          kind,
        });
      } catch (e) {
        console.log("transport-produce소켓", e);
      }
    }
  );
  // see client's socket.emit('transport-recv-connect', ...)
  socket.on(
    "transport-recv-connect",
    async ({ dtlsParameters, serverConsumerTransportId }) => {
      try {
        // console.log(`DTLS PARAMS: ${dtlsParameters}`)
        const consumerTransport = await transports.find((transportData) => {
          // console.log(transportData);
          return (
            transportData.consumer &&
            transportData.transport.id == serverConsumerTransportId
          );
        })?.transport;
        await consumerTransport.connect({ dtlsParameters });
      } catch (e) {
        console.log("transport-recv-connect소켓", e);
      }
    }
  );

  const addConsumer = (consumer, roomName) => {
    // add the consumer to the consumers list
    consumers = [...consumers, { socketId: socket.id, consumer, roomName }];

    // add the consumer id to the peers list
    peers[socket.id] = {
      ...peers[socket.id],
      consumers: [...peers[socket.id].consumers, consumer.id],
    };
  };

  const addProducer = (producer, roomName, kind) => {
    producers = [
      ...producers,
      { socketId: socket.id, producer, roomName, kind },
    ];

    peers[socket.id] = {
      ...peers[socket.id],
      producers: [...peers[socket.id].producers, producer.id],
    };
  };
  socket.on("getProducers", ({ kind }, callback) => {
    //return all producer transports
    // consumer가 호출
    try {
    console.log(kind);
    const { roomName } = peers[socket.id];

    let producerList = [];
    producers.forEach((producerData) => {
      if (
        producerData.socketId !== socket.id &&
        producerData.roomName === roomName &&
        producerData.kind === kind
      ) {
        producerList = [
          ...producerList,
          {
            producerId: producerData.producer.id,
            socketId: producerData.socketId,
          },
        ];
      }
    });
    console.log("&&&&&&&&&&&& socket id : ", socket.id);
    // console.log("^^^^^^^^^^^^^^^^^^ producerList : ", producerList);
    // return the producer list back to the client
    callback(producerList);
  } catch (e) {
    console.log(e);
  }
  });

  const informConsumers = (roomName, socketId, id, kind) => {
    // console.log(`just joined, id ${id} ${roomName}, ${socketId}`)
    // A new producer just joined
    // let all consumers to consume this producer
    producers.forEach((producerData) => {
      if (
        producerData.socketId !== socketId &&
        producerData.roomName === roomName &&
        producerData.kind === kind
      ) {
        const producerSocket = peers[producerData.socketId].socket;
        console.log(`inform 몇 번: socket.id ${socket.id}`);
        // use socket to send producer id to producer
        producerSocket.emit("new-producer", {
          producerId: id,
          socketId: socketId,
        });
      }
    });
  };

  const createWebRtcTransport = async (router) => {
    return new Promise(async (resolve, reject) => {
      try {
        const { initialAvailableOutgoingBitrate } =
          config.mediasoup.webRtcTransport;
        // https://mediasoup.org/documentation/v3/mediasoup/api/#WebRtcTransportOptions
        const webRtcTransport_options = {
          // listenIps: [
          //   {
          //     ip: "0.0.0.0",
          //     // announcedIp: "192.168.0.47",
          //     announcedIp: "172.31.85.197",
          //     //
          //     // ip: "172.31.85.197", // replace with relevant IP address
          //     // announcedIp: "52.90.35.199", // replace with relevant IP address 여기에 aws IP주소 넣으면 됨*!!
          //     //
          //   },
          // ],
          listenIps: config.mediasoup.webRtcTransport.listenIps,
          enableUdp: true,
          enableTcp: true,
          preferUdp: true,
          initialAvailableOutgoingBitrate,
        };

        // https://mediasoup.org/documentation/v3/mediasoup/api/#router-createWebRtcTransport
        let transport = await router.createWebRtcTransport(
          webRtcTransport_options
        );
        // console.log(`transport id: ${transport.id}`)

        transport.on("dtlsstatechange", (dtlsState) => {
          if (dtlsState === "closed") {
            transport.close();
          }
        });

        transport.on("close", () => {
          console.log("transport closed");
        });

        resolve(transport);
      } catch (error) {
        reject(error);
      }
    });
  };

  socket.on(
    "consume",
    async (
      {
        rtpCapabilities,
        remoteProducerId,
        serverConsumerTransportId,
        remoteSocketId,
      },
      callback
    ) => {
      try {
        const { roomName } = peers[socket.id];
        const router = rooms[roomName].router;
        let consumerTransport = transports.find(
          (transportData) =>
            transportData.consumer &&
            transportData.transport.id == serverConsumerTransportId
        ).transport;

        // check if the router can consume the specified producer
        if (
          router.canConsume({
            producerId: remoteProducerId,
            rtpCapabilities,
          })
        ) {
          // transport can now consume and return a consumer
          const consumer = await consumerTransport.consume({
            producerId: remoteProducerId,
            rtpCapabilities,
            paused: true,
          });

          consumer.on("transportclose", () => {
            console.log("transport close from consumer");
          });

          consumer.on("producerclose", () => {
            console.log("producer of consumer closed");
            socket.emit("producer-closed", {
              remoteProducerId,
              remoteSocketId,
            });

            consumerTransport.close([]);
            transports = transports.filter(
              (transportData) =>
                transportData.transport.id !== consumerTransport.id
            );
            consumer.close();
            consumers = consumers.filter(
              (consumerData) => consumerData.consumer.id !== consumer.id
            );
          });

          addConsumer(consumer, roomName);

          // from the consumer extract the following params
          // to send back to the Client
          const params = {
            id: consumer.id,
            producerId: remoteProducerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            serverConsumerId: consumer.id,
          };

          // send the parameters to the client
          callback({ params }, socket.id); //socket.id를 front에서는 안받음...안쓰면 지우는걸로
        }
      } catch (error) {
        console.log(error.message);
        callback({
          params: {
            error: error,
          },
        });
      }
    }
  );

  socket.on("consumer-resume", async ({ serverConsumerId }) => {
    try {
      const { consumer } = consumers.find(
        (consumerData) => consumerData.consumer.id === serverConsumerId
      );
      await consumer?.resume();
    } catch (e) {
      console.log("consumer-resume", e);
    }
  });

  socket.on("leave_Group", (removeSid) => {
    console.log("그룹을 나가는 유저의 sid = ", removeSid);
    const leaveUser = charMap[removeSid];
    socket.to(leaveUser?.roomId).emit("remove_reduplication", socket?.id);
    // 그룹 넘버 초기화
    removeUser(removeSid);
  });

  async function removeUser(removeSid) {
    try {
      let deleted = []; // player.id로 groupObjArr에서 roomName찾기
      let findGroupName;
      for (let i = 0; i < groupObjArr.length; i++) {
        for (let j = 0; j < groupObjArr[i].users.length; j++) {
          // 거리가 멀어질 player의 Sid로 화상통화 그룹 정보에 저장된 동일한 Sid를 찾아서 그룹에서 삭제해준다
          if (removeSid === groupObjArr[i].users[j].socketId) {
            findGroupName = groupObjArr[i].groupName;
            socket.leave(findGroupName); //  socket Room 에서 삭제
            // console.log("socket에서 잘 삭제됐는지?", socket.rooms);
            console.log(
              `[server] groupObjArr[${i}].users[${j}]를 삭제`,
              groupObjArr[i].users[j]
            );
            groupObjArr[i].users.splice(j, 1); // 우리가 따로 저장했던 배열에서도 삭제
            console.log(
              `[server] groupObjArr[${i}].users`,
              groupObjArr[i].users
            );
            if (groupObjArr[i].users.length === 0) {
              // for 빈 소켓 룸([]) 삭제 1
              deleted.push(i);
            }
            // console.log(groupObjArr[i].users);
            break;
          }
        }
      }

      // console.log(groupObjArr);
      for (let i = 0; i < deleted.length; i++) {
        // for 빈 소켓 룸([]) 삭제 2
        groupObjArr.splice(deleted[i], 1);
      }

      // WebRTC SFU (mediasoup)
      // do some cleanup
      consumers = await removeItems(consumers, removeSid, "consumer");
      producers = await removeItems(producers, removeSid, "producer");
      transports = await removeItems(transports, removeSid, "transport");
      // console.log(
      //   `consumers ${consumers}, producers ${producers}, transports ${transports}`
      // );
      const roomName = peers[removeSid].roomName;
      delete peers[removeSid];

      // remove socket from room
      rooms[roomName] = {
        router: rooms[roomName].router,
        peers: rooms[roomName].peers.filter(
          (socketId) => socketId !== removeSid
        ),
      };
      // ^ WebRTC SFU (mediasoup) ^

      console.log("____________leave_group____________");
      socket.to(findGroupName).emit("leave_succ", { removeSid });
      charMap[removeSid].groupNumber = 0;
    } catch (e) {
      console.log("removeUser함수", e);
    }
  }
});

const removeItems = (items, socketId, type) => {
  try {
    items.forEach((item) => {
      if (item.socketId === socketId) {
        item[type].close();
      }
    });
    items = items.filter((item) => item.socketId !== socketId);

    return items;
  } catch (e) {
    console.log("removeItem함수", e);
  }
};

//when caller make the room
function makeGroup(socket) {
  try {
    console.log("makeGroup");
    const user = charMap[socket.id];
    user.groupNumber = ++groupName;
    initGroupObj = {
      groupName: groupName,
      currentNum: 0,
      users: [
        {
          socketId: socket.id,
          // nickname,
        },
      ],
    };

    console.log("-----------", groupName);
    groupObjArr.push(initGroupObj);

    socket.join(groupName);
    // console.log("join:", groupName);
    socket.emit("accept_join", initGroupObj.groupName);
    return groupName;
  } catch (e) {
    console.log("makeGroup함수", e);
  }
}
//groupObjArr 배열에서 groupName에 해당하는 인덱스값 반환
function getGroupIdx(groupName){
  for (let index=0; index<groupObjArr; index++){
    if (groupObjArr[index].groupName === groupName)
      return index;
  }
}
//when callee join the room
function joinGroup(groupName, socket, nickname) {
  try {
    let groupIdx = getGroupIdx(groupName)
    
    //Add socket info to array in groupObj 
    groupObjArr[groupIdx].users.push({
      socketId: socket.id,
      nickname,
    });
    
    //Join the room
    socket.join(groupName);
    socket.emit("accept_join", groupObjArr[i].groupName);
  } catch (e) {
    console.log("joinGroup함수", e);
  }
}
// //when callee join the room
// function joinGroup(groupName, socket, nickname) {
//   try {
//     // console.log("joinGroup");
//     for (let i = 0; i < groupObjArr.length; ++i) {
//       // console.log(
//       //   `${i} 방 안에 있는 모든 유저의 소켓ID : `,
//       //   groupObjArr[i].users
//       // );
//       // console.log(groupObjArr[i], groupName);
//       if (groupObjArr[i].groupName === groupName) {
//         // Reject join the room
//         // if (groupObjArr[i].users.length >= MAXIMUM) {
//         //   socket.emit("reject_join");
//         //   return;
//         // }
//         //Join the room
//         groupObjArr[i].users.push({
//           socketId: socket.id,
//           nickname,
//         });

//         socket.join(groupName);
//         socket.emit("accept_join", groupObjArr[i].groupName);
//       }
//     }
//   } catch (e) {
//     console.log("joinGroup함수", e);
//   }
// }

module.exports = app;
