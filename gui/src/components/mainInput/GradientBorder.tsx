import styled, { keyframes } from "styled-components";

const gradient = keyframes`
  0% {
    background-position: 0px 0;
  }
  100% {
    background-position: 100em 0;
  }
`;

// Note: This component uses styled-components v5. The 'loading' prop will be forwarded to the DOM.
// In v5, use shouldForwardProp (via styled-components/babel plugin or manual filtering) to prevent
// specific props from reaching the DOM if needed. Transient props (e.g., $loading) are only
// available in styled-components v6+.

export const GradientBorder = styled.div<{
  borderRadius?: string;
  borderColor?: string;
  loading: 0 | 1;
}>`
  border-radius: ${(props) => props.borderRadius || "0"};
  padding: 1px;
  background: ${(props) =>
    props.borderColor
      ? props.borderColor
      : `repeating-linear-gradient(
      90deg,
      #00ff00 0%,
      #7fff00 12%,
      #00ced1 25%,
      #00bfff 38%,
      #1e90ff 50%,
      #00bfff 62%,
      #00ced1 75%,
      #7fff00 88%,
      #00ff00 100%
    )`};
  animation: ${(props) => (props.loading ? gradient : "none")} 4s linear
    infinite;
  background-size: 200% 200%;
  width: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-top: ${(props) => (props.loading ? "8px" : "0")};

  /* Add subtle glow when loading */
  ${(props) =>
    props.loading &&
    `
    box-shadow: 0 0 10px rgba(0, 255, 0, 0.3),
                0 0 20px rgba(0, 206, 209, 0.2);
  `}
`;
