const { ApolloServer, gql } = require('apollo-server');
const { MongoClient, ObjectID} = require('mongodb');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
dotenv.config();



const { DB_URI, DB_NAME, JWT_SECRET } = process.env;

const getToken = user => jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7 days' });

const getUserFromToken = async (token, db) => {
  if(!token) {
    return null;
  }
  const tokenData = jwt.verify(token, JWT_SECRET);
  if (!tokenData.id) {
    return null;
  }
  const user = await db.collection('Users').findOne({ _id: ObjectID(tokenData.id)});
  return user;
}

// A schema is a collection of type definitions (hence "typeDefs")
// that together define the "shape" of queries that are executed against
// your data.
const typeDefs = gql`
  type Query {
    myProjects: [Project!]!
  }

  type Mutation {
    signUp(input: SingUpInput): AuthUser!
    signIn(input: SingInInput): AuthUser!
  }

  input SingInInput {
    email: String!
    password: String!
  }

  input SingUpInput {
    email: String!, 
    password: String!, 
    name: String!, 
    avatar: String
  }

  type AuthUser {
    user: User!
    token: String!
  }

  type User {
    id: ID!
    name: String!
    email: String!
    avatar: String
  }
  type Project {
    id: ID!
    createdAt: String!
    title: String!
    progress: Float!
    users: [User!]!
    todos: [ToDo!]!
  }
  type ToDo {
    id: ID!
    content: String!
    isCompleted: Boolean!
    project: Project!
  }
`;


const resolvers = {
  Query: {
   myProjects: () => []
  },
  Mutation: {
    signUp: async (_, { input }, { db }) => {
      const hashedPassword = bcrypt.hashSync(input.password);
      const user = {
        ...input,
        password: hashedPassword,
      }
      // save to database
      const result = await db.collection('Users').insert(user)
      return {
        user: result.ops[0],
        token: getToken(result.ops[0])
      }
    },
    signIn: async (_, { input }, { db }) => {
      const user = await db.collection('Users').findOne({email: input.email});
      if(!user) {
        throw new Error("Invalid credentials");
      }
      // check if password is correct
      const isPasswordCorrect = bcrypt.compareSync(input.password, user.password);
      if(!isPasswordCorrect){
        throw new Error("Password invalid");
      }
      return {
        user,
        token: getToken(user)
      }
    }
  },
  User: {
    id: ({ _id, id }) => _id || id
  },
};
const startDB = async () => { 
  const client = new MongoClient(DB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  await client.connect();
  const db = client.db(DB_NAME);
  // The ApolloServer constructor requires two parameters: your schema
  // definition and your set of resolvers.
  const server = new ApolloServer({ 
    typeDefs, 
    resolvers, 
    context: async ({req}) => {
      const user = await getUserFromToken(req.headers.authorization, db);
      return {
        db,
        user
      }
    }
  }) ;

  // The `listen` method launches a web server.
  server.listen().then(({ url }) => {
    console.log(`🚀  Server ready at ${url}`);
  });
}
startDB();

