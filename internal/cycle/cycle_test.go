package cycle

import (
	"testing"
	"time"
)

func TestKnownProjectionDates(t *testing.T) {
	response := NewService().Generate()
	if len(response.Items) < 3 {
		t.Fatalf("got %d items", len(response.Items))
	}

	want := []struct{ ath, low string }{
		{"2017-12-16T00:00:00Z", "2018-12-21T00:00:00Z"},
		{"2021-11-10T12:00:00Z", "2022-11-15T12:00:00Z"},
		{"2025-10-06T00:00:00Z", "2026-10-11T00:00:00Z"},
	}
	for index, expected := range want {
		ath, _ := time.Parse(time.RFC3339, expected.ath)
		low, _ := time.Parse(time.RFC3339, expected.low)
		if !response.Items[index].ATH.Equal(ath) {
			t.Errorf("ATH %d = %s", index, response.Items[index].ATH)
		}
		if !response.Items[index].Low.Equal(low) {
			t.Errorf("low %d = %s", index, response.Items[index].Low)
		}
	}
}

func TestProjectionThrough2200(t *testing.T) {
	response := NewService().Generate()
	if len(response.Items) != 47 {
		t.Fatalf("items = %d", len(response.Items))
	}

	last := response.Items[len(response.Items)-1]
	if last.CycleNumber != 46 {
		t.Fatalf("cycle = %d", last.CycleNumber)
	}

	wantATH := time.Date(2197, time.June, 28, 0, 0, 0, 0, time.UTC)
	if !last.ATH.Equal(wantATH) {
		t.Fatalf("ATH = %s", last.ATH)
	}

	wantLow := time.Date(2198, time.July, 3, 0, 0, 0, 0, time.UTC)
	if !last.Low.Equal(wantLow) {
		t.Fatalf("low = %s", last.Low)
	}
}

func TestModelIsHardcoded(t *testing.T) {
	response := NewService().Generate()
	if response.Model.AnchorATH != AnchorATH {
		t.Fatalf("anchor = %s", response.Model.AnchorATH)
	}
	if response.Model.BearDays != BearDays || response.Model.BullDays != BullDays {
		t.Fatalf("model = %v", response.Model)
	}
	if response.Model.UntilYear != UntilYear {
		t.Fatalf("until year = %d", response.Model.UntilYear)
	}
}
