import { MyContext } from "src/types";
import { MiddlewareFn } from "type-graphql";

export const isAuth: MiddlewareFn<MyContext> = async ({ context }, next) => {
  if (!context.req?.session?.userId) {
    throw Error("not Authenticated");
  }

  return next();
};
