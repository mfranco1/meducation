/** An explicit declined review is an ordinary editing outcome, not a failed request. */
export class AdminActionCanceled extends Error {
  constructor(message = 'Save canceled; unsaved text is kept.') {
    super(message);
    this.name = 'AdminActionCanceled';
  }
}
