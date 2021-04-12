const { ApolloServer, gql } = require('apollo-server');
const { MongoClient, ObjectID } = require('mongodb');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
dotenv.config();



const { DB_URI, DB_NAME, JWT_SECRET, DB_LOCAL_URI, PORT } = process.env;

const getToken = user => jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7 days' });

const getUserFromToken = async (token, db) => {
  if (!token) {
    return null;
  }
  const tokenData = jwt.verify(token, JWT_SECRET);
  if (!tokenData.id) {
    return null;
  }
  const user = await db.collection('Users').findOne({ _id: ObjectID(tokenData.id) });
  return user;
}

// A schema is a collection of type definitions (hence "typeDefs")
// that together define the "shape" of queries that are executed against
// your data.
const typeDefs = gql`
  type Query {
    myProjects: [Project!]!
    getProject(id: ID!): Project
  }

  type Mutation {
    signUp(input: SingUpInput!): AuthUser!
    signIn(input: SingInInput!): AuthUser!

    createProject(title: String!): Project!
    updateProject(id: ID!, title: String!): Project
    deletedProject(id: ID!): Boolean!
    addUserToProject(projectId: ID!, userId: ID!): Project

    createToDo(content: String!, projectId: ID!): ToDo!
    updateToDo(content: String, id: ID!, isCompleted: Boolean): ToDo!
    deleteToDo(id: ID!): Boolean!
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
    myProjects: async (_, __, { db, user }) => {
      if (!user) {
        throw new Error("Authentication error! Please sign in!")
      }
      return await db.collection('ProjectList')
        .find({ userIDs: user._id })
        .toArray();
    },
    getProject: async (_, { id }, { db, user }) => {
      if (!user) {
        throw new Error("Authentication error. Please sign in!");
      }
      return await db.collection("ProjectList").findOne({ _id: ObjectID(id) })
    }
  },
  Mutation: {
    // authentication
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
      const user = await db.collection('Users').findOne({ email: input.email });
      if (!user) {
        throw new Error("Invalid credentials");
      }
      // check if password is correct
      const isPasswordCorrect = bcrypt.compareSync(input.password, user.password);
      if (!isPasswordCorrect) {
        throw new Error("Password invalid");
      }
      return {
        user,
        token: getToken(user)
      }
    },
    // Project item
    createProject: async (_, { title }, { db, user }) => {
      if (!user) {
        throw new Error("Authentication error. Please sign in!");
      }
      const newProject = {
        title,
        createdAt: new Date().toISOString(),
        userIDs: [user._id]
      }
      const result = await db.collection("ProjectList").insert(newProject);
      return result.ops[0];
    },
    updateProject: async (_, { id, title }, { db, user }) => {
      if (!user) {
        throw new Error("Authentication error. Please sign in!");
      }
      const result = await db.collection("ProjectList")
        .updateOne({
          _id: ObjectID(id)
        }, {
          $set: {
            title
          }
        });
      return await db.collection("ProjectList").findOne({ _id: ObjectID(id) })
    },
    deletedProject: async (_, { id }, { db, user }) => {
      if (!user) {
        throw new Error("Authentication error. Please sign in!");
      }
      try {
        await db.collection("ProjectList").deleteOne({ _id: ObjectID(id) });
      } catch (e) {
        throw new Error(e.message)
      }
      return true;
    },
    addUserToProject: async (_, { projectId, userId }, { db, user }) => {
      if (!user) {
        throw new Error("Authentication error. Please sign in!");
      }
      const project = await db.collection("ProjectList").findOne({ _id: ObjectID(projectId)})
      if (!project) {
        return null;
      }
      if(project.userIDs.find(dbId => dbId.toString() === userId.toString())) {
        console.log(project)
        return project;
      }
      await db.collection("ProjectList")
        .updateOne({
          _id: ObjectID(projectId)
        }, {
          $push: {
            userIDs: ObjectID(userId)
          }
        });
      project.userIDs.push(ObjectID(userId));
      return project;
    },
    // Todo Item
    createToDo: async (_, { content, projectId }, { db, user}) => {
      if (!user) {
        throw new Error("Authentication error. Please sign in!");
      }
      const newTodo = {
        content,
        isCompleted: false,
        projectId: ObjectID(projectId)
      }
      const result = await db.collection("ToDo").insertOne(newTodo);
      console.log(result.ops[0])
      return result.ops[0];
    },
    updateToDo: async (_, data , { db, user }) => {
      if (!user) {
        throw new Error("Authentication error. Please sign in!");
      }
      const result = await db.collection('ToDo')
                              .updateOne({
                                _id: ObjectID(data.id)
                              }, {
                                $set: data
                              });
      return await db.collection("ToDo").findOne({ _id: ObjectID(data.id)});
    },
    deleteToDo: async (_, { id }, { db, user }) => {
      if (!user) {
        throw new Error("Authentication error. Please sign in!");
      }
      await db.collection("ToDo").removeOne({ _id: ObjectID(id)})
      return true;
    }
  },
  User: {
    id: ({ _id, id }) => _id || id
  },
  Project: {
    id: ({ _id, id }) => _id || id,
    progress: async ({ _id }, _, { db }) => {
      const todos = await db.collection("Todos").find({projectId: ObjectID(_id)}).toArray();
      if(todos.length === 0) return 0;
      const completed = todos.filter(todo => todo.isCompleted);
      return 100 * completed.length / todos.length;
    },
    users: async ({ userIDs }, _, { db }) => Promise.all(
      userIDs.map(userID => (
        db.collection("Users").findOne({ _id: userID })
      ))
    ),
    todos: async ({ _id }, _, { db }) => (
      await db.collection('ToDo').find({ projectId: ObjectID(_id)}).toArray()
    )
  },
  ToDo: {
    id: ({ _id, id }) => _id || id,
    project: async ({ projectId }, _, { db }) => {
      return await db.collection('ProjectList').findOne({ _id: ObjectID(projectId)})
    }
  }
};
const startDB = async () => {
  console.log(DB_URI)
  const client = new MongoClient(DB_LOCAL_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  await client.connect();
  const db = client.db(DB_NAME);
  // The ApolloServer constructor requires two parameters: your schema
  // definition and your set of resolvers.
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: async ({ req }) => {
      const user = await getUserFromToken(req.headers.authorization, db);
      return {
        db,
        user
      }
    }
  });

  // The `listen` method launches a web server.
  server.listen().then(({ url }) => {
    console.log(`🚀  Server ready at ${url}`);
  });
}
startDB();

