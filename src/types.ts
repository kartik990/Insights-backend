import { Field, InputType } from "type-graphql";
import { Response, Request } from "express";
import { Redis } from "ioredis";
import { createUserLoader } from "./utils/createUserLoader";
import { createUpdootLoader } from "./utils/createUpdootLoader";

export type MyContext = {
  req: Request & { session?: any };
  res: Response & { session?: any };
  redisClient: Redis;
  userLoader: ReturnType<typeof createUserLoader>;
  updootLoader: ReturnType<typeof createUpdootLoader>;
};

@InputType()
export class UsernamePasswordInput {
  @Field()
  username: string;

  @Field(() => String, { nullable: true })
  email?: string;

  @Field()
  password: string;
}

@InputType()
export class PostInputType {
  @Field()
  title: string;

  @Field()
  text: string;
}
