import "reflect-metadata";
import express from "express";
import RedisStore from "connect-redis";
import session from "express-session";
import Redis from "ioredis";
import cors from "cors";
import path from "path";
import { createConnection } from "typeorm";

import { config } from "dotenv";
config();

import { ApolloServer } from "apollo-server-express";
import { buildSchema } from "type-graphql";
import { HelloResolver } from "./resolvers/hello";
import { PostResolver } from "./resolvers/post";
import { UserResolver } from "./resolvers/user";

import { ___prod___ } from "./constants";
import { Updoot } from "./entities/Updoot";
import { User } from "./entities/User";
import { Post } from "./entities/Post";
import { createUserLoader } from "./utils/createUserLoader";
import { createUpdootLoader } from "./utils/createUpdootLoader";

const main = async () => {
  await createConnection({
    type: "postgres",
    url: process.env.DATABASE_URL,
    logging: true,
    synchronize: true,
    migrations: [path.join(__dirname, "./migrations/*`")],
    entities: [Post, User, Updoot],
  });

  // await conn.runMigrations();

  const app: any = express();

  app.use(
    cors({
      origin: "http://localhost:3000/",
      credentials: true,
    })
  );

  // Initialize client.
  // @ts-ignore
  const redisClient = new Redis({
    host: "localhost",
    port: process.env.REDIS_PORT || 6379,
  });

  redisClient
    .connect(() => {
      console.log(
        `Connected to redis  port : ${process.env.REDIS_PORT}-------------------`
      );
    })
    .catch(console.error);

  // Initialize store.
  const redisStore = new RedisStore({
    client: redisClient,
    ttl: 1000 * 60 * 60 * 5,
    prefix: "reddit:",
    disableTouch: true,
  });

  // Initialize session storage.
  app.use(
    session({
      name: "qid",
      store: redisStore,
      resave: false, // required: force lightweight session keep alive (touch)
      saveUninitialized: false, // recommended: only save session when data exists
      secret: process.env.SESSION_SECRET_KEY as string,
      cookie: {
        maxAge: 1000 * 60 * 60 * 5,
        httpOnly: true,
        sameSite: ___prod___ ? "lax" : "none", // csrf
        secure: ___prod___, // cookie only work in https
      },
    })
  );

  const apolloServer = new ApolloServer({
    schema: await buildSchema({
      resolvers: [HelloResolver, PostResolver, UserResolver],
      validate: false,
    }),
    context: ({ req, res }) => ({
      req,
      res,
      redisClient,
      userLoader: createUserLoader(),
      updootLoader: createUpdootLoader(),
    }),
  });

  await apolloServer.start();
  apolloServer.applyMiddleware({
    app,
    cors: {
      origin: false,
    },
  });

  app.listen(process.env.SERVER_PORT || 5000, () => {
    console.log(`Server listening on port : 5000------------------------`);
  });
};

main();
