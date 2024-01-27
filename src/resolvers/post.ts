import { MyContext, PostInputType } from "./../types";
import { Post } from "./../entities/Post";
import {
  Arg,
  Ctx,
  Field,
  FieldResolver,
  Int,
  Mutation,
  ObjectType,
  Query,
  Resolver,
  Root,
  UseMiddleware,
} from "type-graphql";
import { isAuth } from "./../middlewares/isAuth";
import { getConnection } from "typeorm";
import { Updoot } from "./../entities/Updoot";
import { User } from "./../entities/User";

@ObjectType()
class PaginatedPosts {
  @Field(() => [Post])
  posts: Post[];

  @Field(() => Boolean)
  hasMore: boolean;
}

@Resolver(Post)
export class PostResolver {
  @FieldResolver(() => String)
  textSnippet(@Root() root: Post) {
    return root.text.slice(0, 50);
  }

  @FieldResolver(() => User)
  creator(
    @Root()
    post: Post,
    @Ctx()
    { userLoader }: MyContext
  ) {
    return userLoader.load(post.creatorId);
  }

  @FieldResolver(() => Int, { nullable: true })
  async voteStatus(
    @Root()
    post: Post,
    @Ctx()
    { updootLoader, req }: MyContext
  ) {
    if (req?.session?.userId) {
      return null;
    }

    const updoot = await updootLoader.load({
      postId: post.id,
      userId: req.session.userId,
    });

    return updoot ? updoot.value : null;
  }

  @Query(() => PaginatedPosts)
  async posts(
    @Arg("limit")
    limit: number,
    @Arg("cursor", () => String, { nullable: true })
    cursor: string | null
  ): Promise<PaginatedPosts> {
    const realLimit = Math.min(50, limit);
    const realLimitPlusOne = realLimit + 1;

    const replacements: any[] = [realLimitPlusOne];

    if (cursor) {
      replacements.push(new Date(parseInt(cursor)));
    } else {
      replacements.push(new Date());
    }

    const posts = await getConnection().query(
      `
      SELECT p.*
      FROM post p
      WHERE p."createdAt" < $2 
      ORDER BY p."createdAt" DESC
      LIMIT $1;
    `,
      replacements
    );

    // const qu = getConnection()
    //   .getRepository(Post)
    //   .createQueryBuilder("post")
    //   .innerJoinAndSelect("post.creator", "user", "user.id = post.'creatorId'");

    // if (cursor) {
    //   qu.where('post."createdAt" < :cursor', {});
    // }

    // const posts = await qu
    //   .orderBy('post."createdAt"', "DESC")
    //   .take(realLimitPlusOne)
    //   .getMany();

    // console.log(qu.getSql(), "--------");

    return {
      posts: posts.slice(0, realLimit),
      hasMore: realLimit < posts.length,
    };
  }

  @Query(() => Post, { nullable: true })
  post(
    @Arg("id", () => Int)
    id: number
  ): Promise<Post | null> {
    // return Post.findOneBy({ where: { id }, relations: ["creator"] });
    return Post.findOneBy({ id });
  }

  @Mutation(() => Boolean)
  @UseMiddleware(isAuth)
  async vote(
    @Arg("postId", () => Int)
    postId: number,
    @Arg("value", () => Int)
    value: number,
    @Ctx()
    { req }: MyContext
  ): Promise<boolean> {
    const { userId } = req.session;
    const isUpdoot = value !== -1;
    const realValue = isUpdoot ? 1 : -1;

    const updoot = await Updoot.findOne({
      where: {
        postId,
        userId,
      },
    });

    //want to change vote
    if (updoot && updoot.value !== realValue) {
      await getConnection().transaction(async (tm) => {
        await tm.query(
          `
        UPDATE updoot
        SET value = $1
        WHERE "userId" = $2 AND "postId" = $3 
        `,
          [realValue, userId, postId]
        );

        await tm.query(
          `
          UPDATE post p
          SET points = points + $1
          WHERE p.id = $2;
        `,
          [2 * realValue, postId]
        );
      });
    }
    // didn't vote yet
    else if (!updoot) {
      await getConnection().transaction(async (tm) => {
        await tm.query(
          `
        INSERT INTO updoot(
          value, "userId", "postId")
          VALUES ($1,$2,$3);
        `,
          [realValue, userId, postId]
        );

        await tm.query(
          `
          UPDATE post p
          SET points = points + $1
          WHERE p.id = $2;
        `,
          [realValue, postId]
        );
      });
    }

    return true;
  }

  @Mutation(() => Post)
  @UseMiddleware(isAuth)
  async createPost(
    @Arg("postInput")
    postInput: PostInputType,
    @Ctx()
    { req }: MyContext
  ): Promise<Post> {
    return Post.create({
      ...postInput,
      creatorId: req.session.userId,
    }).save();
  }

  @Mutation(() => Post, { nullable: true })
  @UseMiddleware(isAuth)
  async updatePost(
    @Arg("id", () => Int) id: number,
    @Arg("title")
    title: string,
    @Arg("text")
    text: string,
    @Ctx()
    { req }: MyContext
  ): Promise<Post | null> {
    const post = await Post.findOne({ where: { id } });

    if (!post) {
      return null;
    }

    const quResult = await getConnection()
      .createQueryBuilder()
      .update(Post)
      .set({ title, text })
      .where('id = :id AND "creatorId"= :creatorId', {
        id,
        creatorId: req.session.userId,
      })
      .returning("*")
      .execute();

    return quResult.raw[0];
  }

  @Mutation(() => Boolean)
  @UseMiddleware(isAuth)
  async deletePost(
    @Arg("id") id: number,
    @Ctx() { req }: MyContext
  ): Promise<boolean> {
    await Post.delete({ id, creatorId: req.session.userId });
    return true;
  }
}
