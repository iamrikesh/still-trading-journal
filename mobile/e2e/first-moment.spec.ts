import { test, expect } from '@playwright/test';

test('a tap opens support, records a moment, and deletion removes it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByText('Temporary demo · history resets when you reload')).toBeVisible();
  await page.getByRole('button', { name: 'FOMO', exact: true }).click();
  await expect(page.getByText('A moving price is not an instruction. I can let this move go.')).toBeVisible();
  await expect(page.getByText('✓ Moment added to temporary demo history')).toBeVisible();
  await page.getByRole('button', { name: 'See my moments', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete FOMO moment' })).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete FOMO moment' }).click();
  await expect(page.getByText('Your first moment starts with a tap.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('temporary demo resets on reload and theme switching preserves current moments', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.getByRole('button', { name: 'Unsure', exact: true }).click();
  await expect(page.getByText('✓ Moment added to temporary demo history')).toBeVisible();
  await page.getByRole('button', { name: 'Now', exact: true }).click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await page.getByRole('button', { name: 'My moments', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete Unsure moment' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'My moments', exact: true }).click();
  await expect(page.getByText('Your first moment starts with a tap.')).toBeVisible();
});

test('narrow layout stays within the viewport and support is reachable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'FOMO', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('now.png') });
  await page.getByRole('button', { name: 'FOMO', exact: true }).click();
  await expect(page.getByText('✓ Moment added to temporary demo history')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('support.png') });
});
