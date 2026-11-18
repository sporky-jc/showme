import React from "react";
import { useSelector } from "react-redux";
import Today from "./Today";
import Welcome from "./Welcome";
import type { RootState } from "../reducers/types";

// The first page: Welcome for a visitor, Today for a signed-in student
function Home() {
  const user = useSelector((state: RootState) => state.user);
  const signedIn = Object.keys(user).length !== 0;
  return <div className="contenthome">{signedIn ? <Today /> : <Welcome />}</div>;
}

export default Home;
