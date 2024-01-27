import DataLoader from "dataloader";
import { Updoot } from "./../entities/Updoot";
import { In } from "typeorm";

export const createUpdootLoader = () =>
  new DataLoader<{ postId: number; userId: number }, Updoot | null>(
    async (keys) => {
      const postIdKeys = keys.map((key) => key.postId);
      const userIdKeys = keys.map((key) => key.userId);

      const updoots = await Updoot.findBy({
        postId: In(postIdKeys),
        userId: In(userIdKeys),
      });

      const updootIdsToUpdoot: Record<string, Updoot> = {};

      updoots.forEach((updoot) => {
        updootIdsToUpdoot[`${updoot.userId}|${updoot.postId}`] = updoot;
      });

      return keys.map(
        (key) => updootIdsToUpdoot[`${key.userId}|${key.postId}`]
      );
    }
  );
