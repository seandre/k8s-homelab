import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from './App';

function getRaceButton(id: string) {
  const button = document.querySelector<HTMLButtonElement>(
    `button[aria-controls="detail-${id}"]`,
  );
  if (!button) {
    throw new Error(`Missing row button for ${id}`);
  }
  return button;
}

describe('calendar interactions', () => {
  it('expands one race at a time and keeps the race ID in the URL hash', async () => {
    const user = userEvent.setup();
    render(<App />);

    const tour = getRaceButton('tour-de-france-femmes-avec-zwift');
    await user.click(tour);
    expect(tour).toHaveAttribute('aria-expanded', 'true');
    expect(window.location.hash).toBe('#tour-de-france-femmes-avec-zwift');
    expect(screen.getByRole('link', { name: /Organizer/i })).toBeVisible();

    const worlds = getRaceButton('world-championships-we-road-race');
    await user.click(worlds);
    expect(worlds).toHaveAttribute('aria-expanded', 'true');
    expect(tour).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelectorAll('.race-detail')).toHaveLength(1);
  });

  it('uses the UCI calendar fallback when a race has no specific links', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(getRaceButton('argenta-classic-deurne'));
    expect(
      screen.getByRole('link', { name: /UCI calendar/i }),
    ).toHaveAttribute('href', expect.stringContaining('uci.org'));
  });

  it('shows an empty state and clears all filters', async () => {
    const user = userEvent.setup();
    render(<App />);

    const search = screen.getByRole('searchbox', { name: /Search races/i });
    await user.type(search, 'this race cannot exist');
    expect(screen.getByRole('heading', { name: /No races found/i })).toBeVisible();
    expect(window.location.search).toContain('q=this+race+cannot+exist');

    await user.click(
      screen.getByRole('button', { name: /Clear all filters/i }),
    );
    expect(search).toHaveValue('');
    expect(screen.queryByText(/No races found/i)).not.toBeInTheDocument();
  });

  it('activates an expandable row from the keyboard', async () => {
    const user = userEvent.setup();
    render(<App />);

    const row = getRaceButton('tour-de-france-femmes-avec-zwift');
    row.focus();
    await user.keyboard('{Enter}');
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(document.querySelector('.race-detail')).toBeVisible();
  });

  it('restores filters and expansion from the URL', () => {
    window.history.replaceState(
      null,
      '',
      '/?country=FRA&sort=race&dir=desc#la-perigord-ladies',
    );
    render(<App />);

    expect(screen.getByLabelText('Country')).toHaveValue('FRA');
    expect(getRaceButton('la-perigord-ladies')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});
