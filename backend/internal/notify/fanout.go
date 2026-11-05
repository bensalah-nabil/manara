package notify

import (
	"context"
	"errors"

	"manara/backend/internal/domain"
)

// Fanout sends every alert to each notifier; one failing does not stop the others.
type Fanout []domain.AlertNotifier

func (f Fanout) Send(ctx context.Context, a domain.Alert) error {
	var errs []error
	for _, n := range f {
		if err := n.Send(ctx, a); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}
