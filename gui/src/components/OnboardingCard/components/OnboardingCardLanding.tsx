import { useContext } from "react";
import { Button, SecondaryButton } from "../..";
import { IdeMessengerContext } from "../../../context/IdeMessenger";
import ContinueLogo from "../../svg/ContinueLogo";
import { useOnboardingCard } from "../hooks/useOnboardingCard";

export function OnboardingCardLanding({
  onSelectConfigure,
  isDialog,
}: {
  onSelectConfigure: () => void;
  isDialog?: boolean;
}) {
  const ideMessenger = useContext(IdeMessengerContext);
  const onboardingCard = useOnboardingCard();

  function onGetStarted() {
    onSelectConfigure();
  }

  function openGitHub() {
    ideMessenger.post("openUrl", "https://github.com/continuedev/continue");
    onboardingCard.close(isDialog);
  }

  function openFeedback() {
    ideMessenger.post(
      "openUrl",
      "https://github.com/continuedev/continue/issues/new/choose",
    );
    onboardingCard.close(isDialog);
  }

  return (
    <div className="xs:px-0 flex w-full max-w-full flex-col items-center justify-center px-4 text-center">
      <div className="xs:flex hidden">
        <ContinueLogo height={75} />
      </div>

      <h2 className="mb-2 mt-4 text-xl font-semibold">
        Thanks for trying Continue! 🎉
      </h2>

      <p className="mb-5 mt-0 w-full text-sm text-gray-400">
        Continue is free and open source. Get started by configuring your own
        API keys.
      </p>

      <Button
        onClick={onGetStarted}
        className="mt-2 grid w-full grid-flow-col items-center gap-2"
      >
        Configure Models
      </Button>

      <div className="mt-6 flex w-full flex-col gap-2">
        <SecondaryButton
          onClick={openGitHub}
          className="grid w-full grid-flow-col items-center gap-2"
        >
          ⭐ Give us a star on GitHub
        </SecondaryButton>

        <SecondaryButton
          onClick={openFeedback}
          className="grid w-full grid-flow-col items-center gap-2"
        >
          💬 Share your feedback
        </SecondaryButton>
      </div>
    </div>
  );
}
