'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { SectionCard, Field } from '@/components/ui/form-controls';
import { Input } from '@/components/ui/inputs';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';

export function SecurityTab() {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const changePassword = useMutation({
    mutationFn: () => api.put('/admin/change-password', { currentPassword, newPassword }),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password changed successfully.');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleChangePassword = () => {
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }
    changePassword.mutate();
  };

  return (
    <SectionCard title="Security" subtitle="Change your admin panel password">
      <Field label="Current password" subtitle="Enter your current password to verify identity">
        <Input type="password" className="w-64" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password" />
      </Field>

      <Field label="New password" subtitle="Minimum 8 characters">
        <Input type="password" className="w-64" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" />
      </Field>

      <Field label="Confirm password" subtitle="Re-enter the new password">
        <Input type="password" className="w-64" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" />
      </Field>

      <div className="mt-4">
        <Button
          variant="secondary"
          loading={changePassword.isPending}
          disabled={!currentPassword || !newPassword || !confirmPassword}
          onClick={handleChangePassword}
        >
          Change Password
        </Button>
      </div>
    </SectionCard>
  );
}
