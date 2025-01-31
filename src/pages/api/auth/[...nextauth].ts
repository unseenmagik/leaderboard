import DiscordProvider from 'next-auth/providers/discord';
import NextAuth from 'next-auth';
import { config as projectConfig } from 'node-config-ts';
import SequelizeAdapter, { models } from '@next-auth/sequelize-adapter';
import { Sequelize, DataTypes } from 'sequelize';

import { getTrainerName } from '@/features/auth/api';
import { leaderboardConnectionString } from '@/database';
import { userHasAccess } from '@/features/auth/api/discord';
import { resolveConfig } from '@/utils/resolveConfig';

export const sequelize = new Sequelize(leaderboardConnectionString, { logging: false });
export const adapter = SequelizeAdapter(sequelize, {
  models: {
    User: sequelize.define(
      'user',
      {
        ...models.User,
        trainerId: {
          type: DataTypes.CHAR,
          allowNull: true,
        },
      },
      { tableName: 'pogo_leaderboard_users' },
    ),
    Account: sequelize.define('account', { ...models.Account }, { tableName: 'pogo_leaderboard_accounts' }),
    Session: sequelize.define('session', { ...models.Session }, { tableName: 'pogo_leaderboard_sessions' }),
    VerificationToken: sequelize.define(
      'verificationToken',
      { ...models.VerificationToken },
      { tableName: 'pogo_leaderboard_verification_tokens' },
    ),
  },
});

if (projectConfig.enableAuth) {
  // TODO: handle migrations
  sequelize.sync({ alter: true });
}

export default NextAuth({
  secret: projectConfig.secret,
  adapter: projectConfig.enableAuth ? adapter : undefined,
  session: {
    strategy: 'jwt',
  },
  providers:
    projectConfig.enableAuth && projectConfig.discord.clientId && projectConfig.discord.clientSecret
      ? [
          DiscordProvider({
            clientId: projectConfig.discord.clientId,
            clientSecret: projectConfig.discord.clientSecret,
            authorization: 'https://discord.com/api/oauth2/authorize?scope=identify+email+guilds',
          }),
        ]
      : [],
  callbacks: {
    async signIn({ account, profile }) {
      return userHasAccess(
        `${profile?.username}#${profile?.discriminator}`,
        account?.access_token,
        account?.providerAccountId,
      );
    },
    async jwt({ token, user, profile }) {
      if (user && 'trainerId' in user && user.trainerId) {
        token.trainerId = user.trainerId;
        token.trainerName = await getTrainerName(`${token.trainerId}`);
      }

      if (user?.id) {
        token.userId = user.id;
      }

      if (profile?.id) {
        token.discordId = profile.id;
      }

      return token;
    },
    async session({ session, token }) {
      if (token.trainerId) {
        session.trainerId = token.trainerId;
        session.trainerName = token.trainerName;
      }

      session.discordId = token.discordId;
      session.userId = token.userId;

      return session;
    },
  },
});

resolveConfig();
