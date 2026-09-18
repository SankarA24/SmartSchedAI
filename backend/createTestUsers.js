import dotenv from "dotenv";
import bcrypt from "bcryptjs";

import dbConnect from "./utils/dbConnect.js";
import User from "./models/User.js";

dotenv.config({ quiet: true });

const createUsers = async () => {
  try {
    await dbConnect();

    const password = await bcrypt.hash("123456", 10);

    const users = [
      {
        name: "Admin",
        email: "admin@smartscheduler.com",
        password,
        role: "admin",
      },

      {
        name: "Dr John",
        email: "faculty@smartscheduler.com",
        password,
        role: "faculty",
      },

      {
        name: "Sankar Student",
        email: "student@smartscheduler.com",
        password,
        role: "student",
      },
    ];

    for (const userData of users) {
      const existingUser = await User.findOne({
        email: userData.email,
      });

      if (existingUser) {
        console.log(`User already exists: ${userData.email}`);
        continue;
      }

      const user = new User(userData);

      await user.save();

      console.log(`Created user: ${userData.email}`);
    }

    console.log("Test users setup completed.");

    process.exit(0);

  } catch (error) {
    console.error("Error creating test users:", error);
    process.exit(1);
  }
};

createUsers();