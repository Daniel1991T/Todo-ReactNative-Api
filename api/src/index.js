const { ApolloServer, gql } = require('apollo-server');
const { MongoClient, ObjectID} = require('mongodb');
const dotenv = require('dotenv');
dotenv.config();



const { DB_URI, DB_NAME } = process.env;



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
    signUp: (_, { input }) => {
      console.log(input)
    },
    signIn: () => {

    }
  }
};
const startDB = async () => { 
  const client = new MongoClient(DB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  await client.connect();
  const db = client.db(DB_NAME);
  // The ApolloServer constructor requires two parameters: your schema
  // definition and your set of resolvers.

  const context = {
    db
  }
  const server = new ApolloServer({ typeDefs, resolvers, context });

  // The `listen` method launches a web server.
  server.listen().then(({ url }) => {
    console.log(`🚀  Server ready at ${url}`);
  });
}
startDB();

