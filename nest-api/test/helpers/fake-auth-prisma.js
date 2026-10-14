function createFakeAuthPrisma() {
  const users = new Map();
  const sessions = new Map();
  let nextUserId = 1;
  let nextSessionId = 1;

  const client = {
    user: {
      async create({ data }) {
        if ([...users.values()].some((user) => user.email === data.email)) {
          const error = new Error("Unique constraint failed");
          error.code = "P2002";
          throw error;
        }
        const user = {
          id: nextUserId++,
          emailVerifiedAt: null,
          otpChallengeId: null,
          otpCodeHash: null,
          otpExpiresAt: null,
          otpResendAfter: null,
          otpAttempts: 0,
          otpPurpose: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data
        };
        users.set(user.id, user);
        return user;
      },
      async findUnique({ where }) {
        if (where.id !== undefined) return users.get(where.id) || null;
        if (where.otpChallengeId !== undefined) {
          return [...users.values()].find((user) => user.otpChallengeId === where.otpChallengeId) || null;
        }
        return [...users.values()].find((user) => user.email === where.email) || null;
      },
      async update({ where, data, select }) {
        const user = users.get(where.id);
        if (!user) {
          const error = new Error("Record not found");
          error.code = "P2025";
          throw error;
        }
        Object.assign(user, data, { updatedAt: new Date() });
        if (select) return Object.fromEntries(Object.keys(select).map((key) => [key, user[key]]));
        return user;
      },
      async updateMany({ where, data }) {
        let count = 0;
        for (const user of users.values()) {
          if (
            user.id === where.id &&
            user.otpChallengeId === where.otpChallengeId
          ) {
            Object.assign(user, data, { updatedAt: new Date() });
            count += 1;
          }
        }
        return { count };
      },
      async delete({ where }) {
        const user = users.get(where.id);
        users.delete(where.id);
        for (const [id, session] of sessions) {
          if (session.userId === where.id) sessions.delete(id);
        }
        return user;
      }
    },
    session: {
      async create({ data }) {
        const sessionId = data.id || nextSessionId++;
        const session = { createdAt: new Date(), ...data, id: sessionId };
        sessions.set(session.id, session);
        return session;
      },
      async findUnique({ where, include }) {
        const session = [...sessions.values()].find(
          (entry) => where.id !== undefined && entry.id === where.id
        );
        if (!session) return null;
        return include?.user
          ? { ...session, user: users.get(session.userId) }
          : session;
      },
      async delete({ where }) {
        const target = where.id;
        const entry = [...sessions.entries()].find(([id]) => id === target);
        if (entry) {
          sessions.delete(entry[0]);
          return entry[1];
        }
        return null;
      },
      async deleteMany({ where }) {
        let count = 0;
        for (const [id, session] of sessions) {
          const matchUser = where.userId === undefined || session.userId === where.userId;
          const matchId = where.id === undefined || session.id === where.id;
          const matchExpires = where.expiresAt?.lte === undefined || session.expiresAt <= where.expiresAt.lte;
          if (matchUser && matchId && matchExpires) {
            sessions.delete(id);
            count += 1;
          }
        }
        return { count };
      }
    },
    product: {
      async findMany() {
        return [];
      },
      async findUnique() {
        return null;
      },
      async count() {
        return 0;
      }
    },
    category: {
      async findMany() {
        return [];
      },
      async count() {
        return 0;
      }
    },
    cart: {
      async upsert({ create }) {
        return { id: 1, ...create };
      },
      async findUnique() {
        return { items: [] };
      }
    },
    cartItem: {
      async findUnique() {
        return null;
      },
      async upsert() {
        return {};
      },
      async updateMany() {
        return { count: 0 };
      },
      async deleteMany() {
        return { count: 0 };
      }
    },
    wishlistItem: {
      async findMany() {
        return [];
      },
      async create() {
        return {};
      },
      async deleteMany() {
        return { count: 0 };
      }
    },
    customerpermission: {
      async findMany() {
        return [];
      }
    },
    async $transaction(callback) {
      return callback(client);
    }
  };

  return {
    ...client,
    client,
    getUsers: () => [...users.values()],
    getSessions: () => [...sessions.values()]
  };
}

module.exports = { createFakeAuthPrisma };
