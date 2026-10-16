import { Stack, Step, StepLabel, Stepper, Typography } from '@mui/material';
export function AdminBatchHeader({
  destination,
  reviewReady,
  reserved = false,
}: {
  destination: string;
  reviewReady: boolean;
  reserved?: boolean;
}) {
  return (
    <Stack spacing={1.5}>
      <Stepper activeStep={reviewReady ? 1 : 0} alternativeLabel>
        {['Content', 'Review', 'Save draft'].map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>
      <Typography variant="body2">Destination · {destination}</Typography>
      <Typography variant="caption" color="text.secondary">
        Up to 10,000 new records per save. Split larger batches before review.
        {reviewReady &&
          (reserved
            ? ' Shown IDs are reserved by the server.'
            : ' Shown IDs are provisional; the server reserves stable IDs during save review.')}
      </Typography>
    </Stack>
  );
}
