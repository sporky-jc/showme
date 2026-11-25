import { logoutUser } from "../actions/user";
import { clearAllSentences } from "../actions/usersentences";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router";
import type { AppDispatch } from "../reducers/types";
import type { UserState } from "../reducers/user";

const useAuthService = () => {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();

  // `setLogOutFailed(true)` when the server couldn't be told to log the user
  // out: they stay signed in, where they are, and can press Log out again
  const signInorOut = async (
    user: UserState,
    setLoading: (loading: boolean) => void,
    handleShowLoginModal: () => void,
    setLogOutFailed: (failed: boolean) => void
  ) => {
    try {
      // sign out user if there is one signed in
      if (Object.keys(user).length !== 0) {
        setLogOutFailed(false);
        setLoading(true); // Start loading
        const loggedOut = await dispatch(logoutUser());
        setLoading(false); // Stop loading
        if (!loggedOut) {
          setLogOutFailed(true);
          return;
        }
        dispatch(clearAllSentences());
        // Navigate to homepage once logged out
        navigate("/");
      } else if (Object.keys(user).length === 0) {
        // Show login modal if no user is currently logged in
        handleShowLoginModal();
      }
    } catch (error) {
      setLoading(false); // Stop loading in case of error
      // Handle any logout errors here
      console.error("Logout failed:", error);
    }
  };

  return signInorOut;
};

export default useAuthService;
