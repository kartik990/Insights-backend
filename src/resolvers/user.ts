import { v4 } from "uuid";
import argon2 from "argon2";
import { User } from "./../entities/User";
import { MyContext, UsernamePasswordInput } from "./../types";
import {
  Arg,
  Ctx,
  Field,
  FieldResolver,
  Mutation,
  ObjectType,
  Query,
  Resolver,
  Root,
} from "type-graphql";
//@ts-ignore
import { EntityManager } from "@mikro-orm/postgresql";
import { validateRegister } from "./../utils/validateRegister";
import { sendEmail } from "./../utils/mailer";
import { getConnection } from "typeorm";

@ObjectType()
class UserResponse {
  @Field(() => [FieldError], { nullable: true })
  errors?: FieldError[];

  @Field(() => User, { nullable: true })
  user?: User;
}

@ObjectType()
class FieldError {
  @Field()
  field: string;

  @Field()
  message: string;
}

@Resolver(User)
export class UserResolver {
  @FieldResolver(() => String)
  email(
    @Root()
    user: User,
    @Ctx()
    { req }: MyContext
  ) {
    if (req.session.userId === user.id) {
      return user.email;
    }

    return "";
  }

  @Query(() => User, { nullable: true })
  async me(
    @Ctx()
    { req }: MyContext
  ) {
    if (!req?.session.userId) {
      return null;
    }

    console.log(`session`, req.session);

    const user = await User.findOneBy({ id: req?.session.userId });

    return user;
  }

  @Mutation(() => UserResponse)
  async register(
    @Arg("options") options: UsernamePasswordInput
  ): Promise<UserResponse> {
    const errors = validateRegister(options);
    if (errors) {
      return {
        errors,
      };
    }

    const hashedPassword = await argon2.hash(options.password);

    let user;
    try {
      const result = await getConnection()
        .createQueryBuilder()
        .insert()
        .into(User)
        .values({
          username: options.username,
          password: hashedPassword,
          email: options.email,
        })
        .returning("*")
        .execute();
      user = result.raw[0];
    } catch (err) {
      console.log(err);
    }

    return { user };
  }

  @Mutation(() => UserResponse)
  async login(
    @Arg("usernameOrEmail") usernameOrEmail: string,
    @Arg("password") password: string,
    @Ctx()
    { req }: MyContext
  ): Promise<UserResponse> {
    const user = await User.findOneBy(
      usernameOrEmail.includes("@")
        ? {
            email: usernameOrEmail,
          }
        : {
            username: usernameOrEmail,
          }
    );

    if (!user) {
      return {
        errors: [
          {
            field: "username",
            message: "could not find a user with this username",
          },
        ],
      };
    }

    const valid = await argon2.verify(user.password, password);

    if (!valid) {
      return {
        errors: [
          {
            field: "password",
            message: "incorrect password",
          },
        ],
      };
    }

    req.session.userId = user.id;
    req.session.message = "Made with <3 by kartik Rai";

    return { user };
  }

  @Mutation(() => Boolean)
  logout(
    @Ctx()
    { req, res }: MyContext
  ) {
    return new Promise((resolve, _) => {
      req.session.destroy((err: any) => {
        res.clearCookie("qid");
        if (err) {
          console.log(err);
          resolve(false);
          return;
        }
        resolve(true);
      });
    });
  }

  @Mutation(() => Boolean)
  async forgotPassword(
    @Arg("email") email: string,
    @Ctx()
    { redisClient }: MyContext
  ): Promise<Boolean> {
    const user = await User.findOne({ where: { email } });

    if (!user) {
      return true;
    }

    const token = v4();
    await redisClient.set(
      "forgot-password" + token,
      user.id,
      "EX",
      1000 * 60 * 60 * 2
    );

    const mailHtml = `<a href='http://${process.env.CLIENT_SERVER}/change-password/${token}'>Reset Password here</a>`;

    sendEmail(email, mailHtml);

    return true;
  }

  @Mutation(() => UserResponse)
  async changePassword(
    @Arg("token") token: string,
    @Arg("newPassword") newPassword: string,
    @Ctx()
    { redisClient }: MyContext
  ): Promise<UserResponse> {
    if (newPassword.length <= 2) {
      return {
        errors: [
          {
            field: "newPassword",
            message: "length must be greater than 2",
          },
        ],
      };
    }

    const userId = await redisClient.get("forgot-password" + token);
    await redisClient.del("forgot-password" + token);

    if (!userId) {
      return {
        errors: [
          {
            field: "token expired",
            message: "please generate new token",
          },
        ],
      };
    }

    const user = await User.findOne({ where: { id: +userId } });

    if (!user) {
      return {
        errors: [
          {
            field: "token",
            message: "user not found",
          },
        ],
      };
    }

    const hashedPassword = await argon2.hash(newPassword);
    User.update({ id: +userId }, { password: hashedPassword });

    return { user };
  }
}
