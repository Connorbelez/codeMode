import { useContext } from "react";
import { Button, SecondaryButton } from "../..";
import { IdeMessengerContext } from "../../../context/IdeMessenger";
import { useCreditStatus } from "../../../hooks/useCredits";
import { useAppSelector } from "../../../redux/hooks";
import { selectCurrentOrg } from "../../../redux/slices/profilesSlice";
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
  const currentOrg = useAppSelector(selectCurrentOrg);

  function onGetStarted() {
    // Sign-in functionality removed
    onSelectConfigure();
  }

  function openBillingPage() {
    ideMessenger.post("controlPlane/openUrl", {
      path: "settings/billing",
      orgSlug: currentOrg?.slug,
    });
    onboardingCard.close(isDialog);
  }

  function openApiKeysPage() {
    ideMessenger.post("controlPlane/openUrl", {
      path: "setup-models/api-keys",
      orgSlug: currentOrg?.slug,
    });
    onboardingCard.close(isDialog);
  }

  const { creditStatus, outOfStarterCredits } = useCreditStatus();

  return (
    <div className="xs:px-0 flex w-full max-w-full flex-col items-center justify-center px-4 text-center">
      <div className="xs:flex hidden">
        <ContinueLogo height={75} />
      </div>

      {outOfStarterCredits ? (
        <>
          <p className="xs:w-3/4 w-full text-sm">
            You've used all your starter credits! Click below to purchase
            credits or configure API keys
          </p>
          <SecondaryButton
            onClick={openApiKeysPage}
            className="mt-4 grid w-full grid-flow-col items-center gap-2"
          >
            Set up API keys
          </SecondaryButton>
          <Button
            onClick={openBillingPage}
            className="mt-4 grid w-full grid-flow-col items-center gap-2"
          >
            Purchase credits
          </Button>
        </>
      ) : (
        <>
          <p className="mb-5 mt-0 w-full text-sm">
            Get started by configuring your models
          </p>

          <Button
            onClick={onGetStarted}
            className="mt-4 grid w-full grid-flow-col items-center gap-2"
          >
            Configure Models
          </Button>
        </>
      )}

      <SecondaryButton onClick={onSelectConfigure} className="w-full">
        Or, configure your own models
      </SecondaryButton>
    </div>
  );
}
